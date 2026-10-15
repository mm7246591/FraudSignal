import type { PostKind } from './post';

/**
 * 判定等級，依把握程度由高到低（規則見 docs/risk-rules.md 第 5 節）。
 * unknown 是資料不足，不代表安全。
 */
type RiskLevel = 'high' | 'caution' | 'notice' | 'unknown';

/** 會在畫面上顯示提示的等級。 */
type VisibleRiskLevel = Exclude<RiskLevel, 'unknown'>;

/** 訊號類別：同一類別再多訊號也不會單獨觸發「注意」以上。community 是其他帳號的留言反應。 */
type RiskCategory = 'lure' | 'offPlatform' | 'payment' | 'link' | 'community';

/** critical：可驗證的證據（165 清單、仿冒網域），單獨即為高風險。 */
type RiskStrength = 'critical' | 'strong' | 'weak';

type RiskSignal = {
  ruleId: string;
  category: RiskCategory;
  strength: RiskStrength;
  label: string;
  /** 觸發的原文片段或網址。 */
  evidence: string;
  /** image：貼文照片裡辨識出的文字。 */
  source: 'text' | 'image' | 'link' | 'blocklist' | 'comment';
};

/**
 * 帳號標示：由貼文判定推導（使用者決定：發過可疑貼文的帳號就標示），
 * 等級取這個帳號已看到貼文的最高等級。posts 包含有風險的留言，kind 區分貼文或留言。
 */
type AccountRisk = {
  handle: string;
  level: VisibleRiskLevel;
  posts: {
    postUrl: string;
    kind: PostKind;
    level: VisibleRiskLevel;
    signals: RiskSignal[];
  }[];
};

/** 規格 7：風險判定結果。 */
type RiskResult = {
  subjectType: 'post';
  subjectKey: string;
  level: RiskLevel;
  signals: RiskSignal[];
  analyzedAt: number;
  /** 超過這個時間就從快取刪除（規格 9 TTL）。 */
  expiresAt: number;
  engineVersion: string;
};

export type {
  RiskLevel,
  VisibleRiskLevel,
  RiskCategory,
  RiskStrength,
  RiskSignal,
  AccountRisk,
  RiskResult,
};
