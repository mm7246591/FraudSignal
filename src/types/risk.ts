/**
 * 判定等級，依把握程度由高到低（規則見 docs/risk-rules.md 第 5 節）。
 * unknown 是資料不足，不代表安全。
 */
export type RiskLevel = 'high' | 'caution' | 'notice' | 'unknown';

/** 訊號類別：同一類別再多訊號也不會單獨觸發「注意」以上。 */
export type RiskCategory = 'lure' | 'offPlatform' | 'payment' | 'link';

/** critical：可驗證的證據（165 清單、仿冒網域），單獨即為高風險。 */
export type RiskStrength = 'critical' | 'strong' | 'weak';

export type RiskSignal = {
  ruleId: string;
  category: RiskCategory;
  strength: RiskStrength;
  label: string;
  /** 觸發的原文片段或網址。 */
  evidence: string;
  source: 'text' | 'link' | 'blocklist';
};

/** 規格 7：風險判定結果。 */
export type RiskResult = {
  subjectType: 'post';
  subjectKey: string;
  level: RiskLevel;
  signals: RiskSignal[];
  analyzedAt: number;
  engineVersion: string;
};
