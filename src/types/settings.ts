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
  /**
   * 沒發現可疑特徵的帳號也掛灰色「已看過 N 篇貼文、M 則留言」標示，確認 ScamLens 有在運作。
   * 不顯示「安全」：規格 US-05、第 5、7 節不把 unknown 當 safe（使用者同意改用「已檢查」）。
   */
  showChecked: boolean;
};

export type { Settings };
