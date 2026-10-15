import {
  COMMUNITY_WARNING,
  ENGINE_VERSION,
  LINK_RULES,
  OFFICIAL_COMMERCE_HOSTS,
  SHILL_PRAISE,
  TEXT_RULES,
  WARNING_CONTEXT,
  hostOf,
} from '@/constants/riskRules';
import type { PostSnapshot } from '@/types/post';
import type { RiskLevel, RiskResult, RiskSignal } from '@/types/risk';

type Blocklist = { hosts: Set<string>; fetchedAt: string };
type Comment = Pick<PostSnapshot, 'authorHandle' | 'visibleText'>;

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

// 網軍留言：只看文字與數字（網軍常換標點、表情符號），至少 8 字、雙字組相似度 ≥ 0.8；
// 「+1」「已私」這類短留言正常貼文也大量重複，不算。
const MIN_SIMILAR_LENGTH = 8;
const SIMILARITY = 0.8;

const bigrams = (text: string) => {
  const chars = [...text];
  return new Set(chars.slice(1).map((char, i) => chars[i] + char));
};

const similarity = (a: Set<string>, b: Set<string>) => {
  const shared = [...a].filter((gram) => b.has(gram)).length;
  return shared / (a.size + b.size - shared);
};

const matchComments = (comments: Comment[]): RiskSignal[] => {
  const parsed = comments.map(({ authorHandle, visibleText }) => ({
    authorHandle,
    visibleText,
    ...normalize(visibleText),
  }));
  const hits = (pattern: RegExp) =>
    parsed.flatMap(({ authorHandle, visibleText, normalized, positions }) => {
      const match = pattern.exec(normalized);
      return match
        ? [
            {
              authorHandle,
              evidence: toOriginal(visibleText, positions, match),
            },
          ]
        : [];
    });
  const accountCount = (list: { authorHandle: string }[]) =>
    new Set(list.map(({ authorHandle }) => authorHandle)).size;
  const signal = (
    ruleId: string,
    strength: RiskSignal['strength'],
    label: string,
    evidence: string
  ): RiskSignal => ({
    ruleId,
    category: 'community',
    strength,
    label,
    evidence,
    source: 'comment',
  });
  const signals: RiskSignal[] = [];

  // 1 個帳號可能是同業或酸民，2 個以上帳號都這樣說才算強訊號。
  const warnings = hits(COMMUNITY_WARNING);
  const warners = accountCount(warnings);
  if (warners) {
    signals.push(
      signal(
        'community-warning',
        warners >= 2 ? 'strong' : 'weak',
        `${warners} 個其他帳號留言指出可能是詐騙`,
        warnings[0].evidence
      )
    );
  }

  const shills = hits(SHILL_PRAISE);
  const shillers = accountCount(shills);
  if (shillers >= 2) {
    signals.push(
      signal(
        'shill-praise',
        'weak',
        `${shillers} 個帳號留言感謝老師或分享獲利（常見暗樁話術）`,
        shills[0].evidence
      )
    );
  }

  // ponytail: 兩兩比對 O(n²)，畫面上的留言通常不到百則；留言上千再改用 MinHash。
  const long = parsed
    .map((comment) => ({
      ...comment,
      words: comment.normalized.replace(/[^\p{L}\p{N}]/gu, ''),
    }))
    .filter(({ words }) => [...words].length >= MIN_SIMILAR_LENGTH)
    .map((comment) => ({ ...comment, grams: bigrams(comment.words) }));
  const largest = long
    .map((comment) =>
      long.filter(
        (other) => similarity(comment.grams, other.grams) >= SIMILARITY
      )
    )
    .reduce<typeof long>(
      (best, group) =>
        accountCount(group) > accountCount(best) ? group : best,
      []
    );
  const similars = accountCount(largest);
  if (similars >= 3) {
    signals.push(
      signal(
        'similar-comments',
        'weak',
        `${similars} 個帳號留言內容幾乎相同（疑似網軍）`,
        largest[0].visibleText.slice(0, 30)
      )
    );
  }
  return signals;
};

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

/** comments：單篇貼文頁上看得到的留言，只當佐證（docs/risk-rules.md 第 6 節）。 */
const evaluatePost = (
  post: PostSnapshot,
  blocklist?: Blocklist,
  comments: Comment[] = []
): RiskResult => {
  const urls = post.outboundUrls.map((url) => new URL(url));
  const hasOfficialCommerce = urls.some((url) =>
    OFFICIAL_COMMERCE_HOSTS.has(hostOf(url))
  );
  const own = [
    ...matchText(post.visibleText),
    ...matchLinks(urls, blocklist),
  ].filter(
    (signal) => !(hasOfficialCommerce && signal.ruleId === 'prepay-only')
  );
  const warningContext = WARNING_CONTEXT.test(
    normalize(post.visibleText).normalized
  );
  // 貼文本身沒有訊號時不看留言，避免「大家有被詐騙過嗎」這類貼文被標示；
  // 貼文在提醒防詐時，留言自然也會講到詐騙，同樣不計。作者自己的留言不算。
  const signals =
    own.length && !warningContext
      ? [
          ...own,
          ...matchComments(
            comments.filter(
              ({ authorHandle }) => authorHandle !== post.authorHandle
            )
          ),
        ]
      : own;
  return {
    subjectType: 'post',
    subjectKey: `${post.platform}:${post.postId}`,
    level: decideLevel(signals, warningContext),
    signals,
    analyzedAt: Date.now(),
    engineVersion: ENGINE_VERSION,
  };
};

const parseBlocklist = (raw: string): Blocklist => ({
  hosts: new Set(
    raw.split('\n').filter((line) => line && !line.startsWith('#'))
  ),
  fetchedAt: /# 下載日期：(\S+)/.exec(raw)?.[1] ?? '未知',
});

let blocklistPromise: Promise<Blocklist> | undefined;

/** 清單約 2MB，獨立成 chunk，第一次遇到外部連結才載入。 */
const loadBlocklist = () => {
  blocklistPromise ??= import('@/constants/blockedDomains.txt?raw').then(
    ({ default: raw }) => parseBlocklist(raw)
  );
  return blocklistPromise;
};

export { evaluatePost, parseBlocklist, loadBlocklist };
