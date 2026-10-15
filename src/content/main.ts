import type { PostSnapshot } from '@/types/post';
import type { RiskResult } from '@/types/risk';
import { evaluatePost, loadBlocklist } from '@/utils/riskEngine';
import { observeThreadsFeed } from './threadsAdapter';

// ponytail: 判定結果只存在這個分頁的記憶體；步驟 4 改存 chrome.storage.local 並加 TTL。
const results = new Map<string, Promise<RiskResult>>();

const analyze = async (post: PostSnapshot) => {
  // 清單載入失敗時退回只用本地規則（規格 9）。
  const blocklist = post.outboundUrls.length
    ? await loadBlocklist().catch(() => undefined)
    : undefined;
  const result = evaluatePost(post, blocklist);
  // 每篇只在第一次分析時輸出。
  const log = result.level === 'unknown' ? console.debug : console.info;
  log(
    `[ScamLens] ${result.level} @${post.authorHandle}`,
    post.postUrl,
    result.signals,
    post
  );
  return result;
};

observeThreadsFeed((post) => {
  if (!results.has(post.postId)) results.set(post.postId, analyze(post));
});
