import { ENGINE_VERSION } from '@/constants/riskRules';
import type { RiskResult } from '@/types/risk';

/**
 * 有風險的貼文判定，存在 chrome.storage.local（規格 FR-05）。重新整理後用來還原帳號標示，
 * 也讓同一篇貼文不再重新分析（US-04）。
 */
type StoredPost = {
  postId: string;
  authorHandle: string;
  postUrl: string;
  result: RiskResult;
};

// 每篇一個鍵，新增時不必重寫整份清單。
const RESULT_PREFIX = 'result:';
// 使用者決定以帳號為單位忽略；規格 7 原為單篇貼文的 ignoredPostKeys。
const IGNORED_KEY = 'ignoredAccounts';
// 規格 9 容量上限；每筆約 1KB，遠低於 chrome.storage.local 的 10MB。
const MAX_RESULTS = 1000;

/**
 * 分出還能用的判定與要刪除的鍵：分析版本不同、已過期、資料格式不對，
 * 或超過容量上限（保留最新分析的）都刪除。
 */
const partitionStored = (stored: Record<string, unknown>, now: number) => {
  const entries = Object.entries(stored).filter(([key]) =>
    key.startsWith(RESULT_PREFIX)
  ) as [string, Partial<StoredPost> | undefined][];
  const valid = entries
    .filter(
      (entry): entry is [string, StoredPost] =>
        entry[1]?.result?.engineVersion === ENGINE_VERSION &&
        entry[1].result.expiresAt > now
    )
    .sort(([, a], [, b]) => b.result.analyzedAt - a.result.analyzedAt)
    .slice(0, MAX_RESULTS);
  const keep = new Set(valid.map(([key]) => key));
  return {
    posts: valid.map(([, post]) => post),
    staleKeys: entries.map(([key]) => key).filter((key) => !keep.has(key)),
  };
};

/** 讀取快取並順便清掉失效的判定。容量只在頁面載入時整理，同一分頁內可暫時超過。 */
const loadStoredRisks = async () => {
  const stored = await chrome.storage.local.get(null);
  const { posts, staleKeys } = partitionStored(stored, Date.now());
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
  const ignored = stored[IGNORED_KEY];
  return {
    posts,
    ignoredAccounts: Array.isArray(ignored) ? (ignored as string[]) : [],
  };
};

const saveStoredPost = async (post: StoredPost) => {
  await chrome.storage.local.set({
    [`${RESULT_PREFIX}${post.result.subjectKey}`]: post,
  });
};

// ponytail: 忽略清單沒有上限也不會過期；每筆只是一個帳號名稱，設定頁（FR-06）再提供清除。
const saveIgnoredAccounts = async (handles: string[]) => {
  await chrome.storage.local.set({ [IGNORED_KEY]: handles });
};

export {
  partitionStored,
  loadStoredRisks,
  saveStoredPost,
  saveIgnoredAccounts,
};
export type { StoredPost };
