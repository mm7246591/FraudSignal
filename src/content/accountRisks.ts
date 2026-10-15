import { reactive } from 'vue';
import type { AccountRisk, RiskResult, VisibleRiskLevel } from '@/types/risk';

const RANK: Record<VisibleRiskLevel, number> = {
  notice: 1,
  caution: 2,
  high: 3,
};

// ponytail: 只存在這個分頁的記憶體，重新整理就清空；步驟 4 改存 chrome.storage.local。
const accounts = new Map<string, AccountRisk>();

export const getAccountRisk = (handle: string) => accounts.get(handle);

/**
 * 記錄一篇貼文的判定到作者帳號；回傳是否為這個帳號第一次被標示。
 * 帳號物件是 reactive，等級升高時已掛上的提示會自動更新。
 */
export const recordPostRisk = (
  handle: string,
  postUrl: string,
  result: RiskResult
) => {
  const { level, signals } = result;
  if (level === 'unknown') return false;
  const existing = accounts.get(handle);
  if (!existing) {
    accounts.set(
      handle,
      reactive({ handle, level, posts: [{ postUrl, level, signals }] })
    );
    return true;
  }
  if (existing.posts.some((post) => post.postUrl === postUrl)) return false;
  existing.posts.push({ postUrl, level, signals });
  if (RANK[level] > RANK[existing.level]) existing.level = level;
  return false;
};
