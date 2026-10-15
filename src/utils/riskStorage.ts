import { ENGINE_VERSION, LEVEL_RANK } from '@/engine/riskRules';
import type { RiskResult } from '@/types/risk';
import type { Settings } from '@/types/settings';

/**
 * 有風險、或辨識過圖片文字的貼文判定，存在 chrome.storage.local（規格 FR-05）。
 * 重新整理後用來還原帳號標示，也讓同一篇貼文不再重新分析、重新辨識圖片（US-04）。
 */
type StoredPost = {
  postId: string;
  authorHandle: string;
  postUrl: string;
  /** 圖片辨識出的文字；留言讓主貼文重新判定時要一起算。 */
  imageText?: string;
  result: RiskResult;
};

// 每篇一個鍵，新增時不必重寫整份清單。
const RESULT_PREFIX = 'result:';
// 使用者決定以帳號為單位忽略；規格 7 原為單篇貼文的 ignoredPostKeys。
const IGNORED_KEY = 'ignoredAccounts';
// 規格 9 容量上限；每筆約 1KB，遠低於 chrome.storage.local 的 10MB。
const MAX_RESULTS = 1000;
const SETTINGS_KEY = 'settings';
// 預設開啟、顯示全部等級；規格 2.3 誤報率達標前不公開預設開啟，這版只給自己與朋友測試。
const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  minLevel: 'notice',
  showChecked: false,
};

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

/** 存的設定可能是舊版或被手動改過，逐欄檢查，不合法的用預設值。 */
const parseSettings = (raw: unknown): Settings => {
  const { enabled, minLevel, showChecked } = (raw ?? {}) as Partial<Settings>;
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SETTINGS.enabled,
    minLevel:
      typeof minLevel === 'string' && Object.hasOwn(LEVEL_RANK, minLevel)
        ? minLevel
        : DEFAULT_SETTINGS.minLevel,
    showChecked:
      typeof showChecked === 'boolean'
        ? showChecked
        : DEFAULT_SETTINGS.showChecked,
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
    settings: parseSettings(stored[SETTINGS_KEY]),
  };
};

const saveStoredPost = async (post: StoredPost) => {
  await chrome.storage.local.set({
    [`${RESULT_PREFIX}${post.result.subjectKey}`]: post,
  });
};

// ponytail: 忽略清單沒有上限也不會過期；每筆只是一個帳號名稱，設定頁可以取消忽略。
const saveIgnoredAccounts = async (handles: string[]) => {
  await chrome.storage.local.set({ [IGNORED_KEY]: handles });
};

/** 清除所有貼文判定（設定頁）；設定與忽略清單保留。 */
const clearStoredResults = async () => {
  const stored = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(
    Object.keys(stored).filter((key) => key.startsWith(RESULT_PREFIX))
  );
};

const saveSettings = async (settings: Settings) => {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
};

/** 其他頁面（設定頁）改設定時通知；回傳停止監聽的函式。 */
const onSettingsChanged = (listener: (settings: Settings) => void) => {
  const handle = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      listener(parseSettings(changes[SETTINGS_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(handle);
  return () => chrome.storage.onChanged.removeListener(handle);
};

export {
  DEFAULT_SETTINGS,
  partitionStored,
  parseSettings,
  loadStoredRisks,
  saveStoredPost,
  saveIgnoredAccounts,
  clearStoredResults,
  saveSettings,
  onSettingsChanged,
};
export type { StoredPost };
