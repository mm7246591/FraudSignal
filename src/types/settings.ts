import type { VisibleRiskLevel } from './risk';

/**
 * 規格 7 的設定（FR-06），存在 chrome.storage.local 的 settings。
 * aiEnabled、urlCheckEnabled、dailyLimit 屬於還沒做的 M3 功能，做了再加。
 */
type Settings = {
  /** 偵測開關（US-03 暫停偵測）。 */
  enabled: boolean;
  /** 敏感度：只顯示這個等級以上的帳號標示。 */
  minLevel: VisibleRiskLevel;
};

export type { Settings };
