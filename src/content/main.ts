import type { PostSnapshot } from '@/types/post';
import type { RiskResult } from '@/types/risk';
import { evaluatePost, loadBlocklist } from '@/utils/riskEngine';
import { getAccountRisk, recordPostRisk } from './accountRisks';
import { syncAccountBadge } from './mountRiskAlert';
import {
  findPostContainers,
  getPostAuthor,
  observeThreadsFeed,
} from './threadsAdapter';

// ponytail: 判定結果只存在這個分頁的記憶體；步驟 4 改存 chrome.storage.local 並加 TTL。
const results = new Map<string, Promise<RiskResult>>();

const analyze = async (post: PostSnapshot) => {
  // 清單載入失敗時退回只用本地規則（規格 9）。
  const blocklist = post.outboundUrls.length
    ? await loadBlocklist().catch(() => undefined)
    : undefined;
  const result = evaluatePost(post, blocklist);
  // 每篇只在第一次分析時輸出，方便對照頭像上的提示。
  const log = result.level === 'unknown' ? console.debug : console.info;
  log(
    `[ScamLens] ${result.level} @${post.authorHandle}`,
    post.postUrl,
    result.signals,
    post
  );
  return result;
};

observeThreadsFeed(async (post, container) => {
  let result = results.get(post.postId);
  if (!result) {
    result = analyze(post);
    results.set(post.postId, result);
  }
  const { authorHandle, postUrl } = post;
  if (recordPostRisk(authorHandle, postUrl, await result)) {
    // 帳號第一次被標示：畫面上這個帳號的其他貼文、留言也補上提示。
    findPostContainers()
      .filter((el) => getPostAuthor(el) === authorHandle)
      .forEach((el) =>
        syncAccountBadge(el, authorHandle, getAccountRisk(authorHandle))
      );
    return;
  }
  syncAccountBadge(container, authorHandle, getAccountRisk(authorHandle));
});
