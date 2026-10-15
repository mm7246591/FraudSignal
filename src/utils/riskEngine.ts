import {
  ENGINE_VERSION,
  LINK_RULES,
  OFFICIAL_COMMERCE_HOSTS,
  TEXT_RULES,
  WARNING_CONTEXT,
  hostOf,
} from '@/constants/riskRules';
import type { PostSnapshot } from '@/types/post';
import type { RiskLevel, RiskResult, RiskSignal } from '@/types/risk';

type Blocklist = { hosts: Set<string>; fetchedAt: string };

// 詐團會用空白、零寬字元或符號拆字，例如「加 L I N E」「穩.賺」。
const REMOVABLE = /[\s\u200b-\u200d\u2060\ufeff.·•*_\-|~/\\]/;

/** 正規化並記錄每個字元在原文的位置，讓證據顯示原文片段。 */
const normalize = (text: string) => {
  let normalized = '';
  const positions: number[] = [];
  let offset = 0;
  Array.from(text).forEach((char) => {
    char
      .normalize('NFKC')
      .toLowerCase()
      .split('')
      .forEach((unit) => {
        if (REMOVABLE.test(unit)) return;
        normalized += unit;
        positions.push(offset);
      });
    offset += char.length;
  });
  return { normalized, positions };
};

const toOriginal = (
  text: string,
  positions: number[],
  match: RegExpExecArray
) => {
  const start = positions[match.index];
  const last = positions[match.index + match[0].length - 1];
  const lastLength = (text.codePointAt(last) ?? 0) > 0xffff ? 2 : 1;
  return text.slice(start, last + lastLength);
};

const matchText = (text: string): RiskSignal[] => {
  const { normalized, positions } = normalize(text);
  return TEXT_RULES.flatMap(({ id, category, strength, label, pattern }) => {
    const match = pattern.exec(normalized);
    if (!match) return [];
    const evidence = toOriginal(text, positions, match);
    return [
      { ruleId: id, category, strength, label, evidence, source: 'text' },
    ];
  });
};

const matchLinks = (urls: URL[], blocklist?: Blocklist): RiskSignal[] =>
  urls.flatMap((url) => {
    const signals: RiskSignal[] = LINK_RULES.filter((rule) =>
      rule.test(url)
    ).map(({ id, category, strength, label }) => ({
      ruleId: id,
      category,
      strength,
      label,
      evidence: url.href,
      source: 'link',
    }));
    // ponytail: 只比對完整網域；清單內上千個子網域共用的主網域沒有合併，因為會誤收 com.tw 這類公共後綴。
    if (blocklist?.hosts.has(hostOf(url))) {
      signals.push({
        ruleId: 'blocklist',
        category: 'link',
        strength: 'critical',
        label: `連結網域在 165 涉詐網站清單（${blocklist.fetchedAt} 版）`,
        evidence: url.href,
        source: 'blocklist',
      });
    }
    return signals;
  });

const decideLevel = (signals: RiskSignal[], warningContext: boolean) => {
  if (signals.some((signal) => signal.strength === 'critical')) return 'high';
  const categories = new Set(signals.map((signal) => signal.category));
  const strongCategories = new Set(
    signals
      .filter((signal) => signal.strength === 'strong')
      .map((signal) => signal.category)
  );
  let level: RiskLevel = 'unknown';
  if (strongCategories.size >= 2) level = 'high';
  else if (strongCategories.size >= 1 && categories.size >= 2)
    level = 'caution';
  else if (strongCategories.size >= 1) level = 'notice';
  // 防詐提醒貼文會引用詐騙話術；沒有連結證據時只給「提醒」。
  const textOnly = signals.every((signal) => signal.source === 'text');
  return warningContext && textOnly && level !== 'unknown' ? 'notice' : level;
};

export const evaluatePost = (
  post: PostSnapshot,
  blocklist?: Blocklist
): RiskResult => {
  const urls = post.outboundUrls.map((url) => new URL(url));
  const hasOfficialCommerce = urls.some((url) =>
    OFFICIAL_COMMERCE_HOSTS.has(hostOf(url))
  );
  const signals = [
    ...matchText(post.visibleText),
    ...matchLinks(urls, blocklist),
  ].filter(
    (signal) => !(hasOfficialCommerce && signal.ruleId === 'prepay-only')
  );
  return {
    subjectType: 'post',
    subjectKey: `${post.platform}:${post.postId}`,
    level: decideLevel(
      signals,
      WARNING_CONTEXT.test(normalize(post.visibleText).normalized)
    ),
    signals,
    analyzedAt: Date.now(),
    engineVersion: ENGINE_VERSION,
  };
};

export const parseBlocklist = (raw: string): Blocklist => ({
  hosts: new Set(
    raw.split('\n').filter((line) => line && !line.startsWith('#'))
  ),
  fetchedAt: /# 下載日期：(\S+)/.exec(raw)?.[1] ?? '未知',
});

let blocklistPromise: Promise<Blocklist> | undefined;

/** 清單約 2MB，獨立成 chunk，第一次遇到外部連結才載入。 */
export const loadBlocklist = () => {
  blocklistPromise ??= import('@/constants/blockedDomains.txt?raw').then(
    ({ default: raw }) => parseBlocklist(raw)
  );
  return blocklistPromise;
};
