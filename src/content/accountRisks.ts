import { reactive } from 'vue';
import { LEVEL_RANK } from '@/engine/riskRules';
import type { PostKind } from '@/types/post';
import type { AccountRisk, RiskResult } from '@/types/risk';

// 帳號標示由貼文判定推導，重新整理後由 main.ts 用快取的判定重建。
const accounts = new Map<string, AccountRisk>();
// 已檢查的貼文與留言（設定頁「顯示已檢查的帳號」）：帳號 → 看過的網址 → 貼文或留言。
// 只算這次在畫面上看過的，快取還原的不算。每個 Map 是 reactive，數量增加時灰色標示跟著更新。
const checked = new Map<string, Map<string, PostKind>>();
// 使用者忽略的帳號（使用者決定以帳號為單位；規格 7 原為單篇 ignoredPostKeys）。
const ignored = new Set<string>();

const getAccountRisk = (handle: string) => accounts.get(handle);

/** 這個帳號已檢查過的貼文與留言；被忽略或還沒檢查過的帳號回傳 undefined。 */
const getCheckedPosts = (handle: string) => checked.get(handle);

/** 記錄畫面上看過的貼文或留言；被忽略的帳號不記錄。 */
const markChecked = (handle: string, postUrl: string, kind: PostKind) => {
  if (ignored.has(handle)) return;
  if (!checked.has(handle)) checked.set(handle, reactive(new Map()));
  checked.get(handle)?.set(postUrl, kind);
};

const restoreIgnored = (handles: string[]) => {
  handles.forEach((handle) => ignored.add(handle));
};

/**
 * 記錄一篇貼文的判定到作者帳號；回傳是否為這個帳號第一次被標示。
 * 同一篇再次判定（看到更多留言）時覆蓋該篇結果；留言只會增加訊號，等級不會下降。
 * 帳號物件是 reactive，等級升高時已掛上的提示會自動更新。被忽略的帳號不記錄。
 */
const recordPostRisk = (
  handle: string,
  postUrl: string,
  result: RiskResult,
  kind: PostKind
) => {
  if (ignored.has(handle)) return false;
  const { level, signals } = result;
  if (level === 'unknown') return false;
  const existing = accounts.get(handle);
  if (!existing) {
    accounts.set(
      handle,
      reactive({ handle, level, posts: [{ postUrl, kind, level, signals }] })
    );
    return true;
  }
  const seen = existing.posts.find((post) => post.postUrl === postUrl);
  if (seen) Object.assign(seen, { level, signals });
  else existing.posts.push({ postUrl, kind, level, signals });
  if (LEVEL_RANK[level] > LEVEL_RANK[existing.level]) existing.level = level;
  return false;
};

/** 忽略帳號（US-03）：移除標示並記到忽略清單，之後這個帳號的貼文都不再標示；存檔由呼叫端處理。 */
const ignoreAccount = (handle: string) => {
  ignored.add(handle);
  accounts.delete(handle);
  checked.delete(handle);
};

export {
  getAccountRisk,
  getCheckedPosts,
  markChecked,
  restoreIgnored,
  recordPostRisk,
  ignoreAccount,
};
