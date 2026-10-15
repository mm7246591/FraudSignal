import { ENGINE_VERSION, LEVEL_RANK } from '@/engine/riskRules';
import type { Platform, PostKind } from '@/types/post';
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
  /** 貼文或留言，原因面板的文案用；舊資料沒有，當貼文。 */
  kind?: PostKind;
  /** 圖片辨識出的文字；留言讓主貼文重新判定時要一起算。 */
  imageText?: string;
  result: RiskResult;
};

/** 忽略的帳號；帳號名稱只在同一個平台內唯一。 */
type IgnoredAccount = { platform: Platform; handle: string };

// 每篇一個鍵，新增時不必重寫整份清單。
const RESULT_PREFIX = 'result:';
// 使用者決定以帳號為單位忽略；規格 7 原為單篇貼文的 ignoredPostKeys。
// 存成「平台:帳號」；只支援 Threads 時存的是帳號名稱，讀取時當成 Threads（帳號名稱不含冒號）。
const IGNORED_KEY = 'ignoredAccounts';
const PLATFORMS: Platform[] = ['threads', 'x'];
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

const parseIgnored = (raw: unknown): IgnoredAccount[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => {
      const [platform, handle] = entry.includes(':')
        ? entry.split(':')
        : ['threads', entry];
      return { platform: platform as Platform, handle };
    })
    .filter(({ platform, handle }) => PLATFORMS.includes(platform) && handle);

const toIgnoredEntry = ({ platform, handle }: IgnoredAccount) =>
  `${platform}:${handle}`;

/** 讀取快取並順便清掉失效的判定。容量只在頁面載入時整理，同一分頁內可暫時超過。 */
const loadStoredRisks = async () => {
  const stored = await chrome.storage.local.get(null);
  const { posts, staleKeys } = partitionStored(stored, Date.now());
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
  return {
    posts,
    ignoredAccounts: parseIgnored(stored[IGNORED_KEY]),
    settings: parseSettings(stored[SETTINGS_KEY]),
  };
};

const saveStoredPost = async (post: StoredPost) => {
  await chrome.storage.local.set({
    [`${RESULT_PREFIX}${post.result.subjectKey}`]: post,
  });
};

// ponytail: 忽略清單沒有上限也不會過期；每筆只是一個帳號名稱，設定頁可以取消忽略。
const saveIgnoredAccounts = async (accounts: IgnoredAccount[]) => {
  await chrome.storage.local.set({
    [IGNORED_KEY]: accounts.map(toIgnoredEntry),
  });
};

/**
 * 加入忽略清單（content script）。先讀再寫，不覆蓋其他分頁、其他平台忽略的帳號。
 * ponytail: 兩個分頁同時忽略可能少存一筆，要處理再改成每個帳號一個鍵。
 */
const addIgnoredAccount = async (account: IgnoredAccount) => {
  const { [IGNORED_KEY]: raw } = await chrome.storage.local.get(IGNORED_KEY);
  const accounts = parseIgnored(raw);
  if (
    accounts.some((item) => toIgnoredEntry(item) === toIgnoredEntry(account))
  ) {
    return;
  }
  await saveIgnoredAccounts([...accounts, account]);
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
  parseIgnored,
  loadStoredRisks,
  saveStoredPost,
  saveIgnoredAccounts,
  addIgnoredAccount,
  clearStoredResults,
  saveSettings,
  onSettingsChanged,
};
export type { StoredPost, IgnoredAccount };
