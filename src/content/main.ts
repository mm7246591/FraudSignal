import type { PostSnapshot } from '@/types/post';
import type { RiskResult } from '@/types/risk';
import { evaluatePost, loadBlocklist } from '@/utils/riskEngine';
import { getAccountRisk, recordPostRisk } from './accountRisks';
import { syncAccountBadge } from './mountRiskAlert';
import {
  findPostContainers,
  getPostAuthor,
  getRepliedPostId,
  observeThreadsFeed,
} from './threadsAdapter';

// ponytail: 判定結果只存在這個分頁的記憶體；步驟 4 改存 chrome.storage.local 並加 TTL。
const results = new Map<string, Promise<RiskResult>>();
const posts = new Map<string, PostSnapshot>();
// 單篇貼文頁的留言：主貼文 postId → 留言 postId → 留言。
const replies = new Map<string, Map<string, PostSnapshot>>();

const analyze = async (post: PostSnapshot, previous?: RiskResult) => {
  // 清單載入失敗時退回只用本地規則（規格 9）。
  const blocklist = post.outboundUrls.length
    ? await loadBlocklist().catch(() => undefined)
    : undefined;
  const comments = [...(replies.get(post.postId)?.values() ?? [])];
  const result = evaluatePost(post, blocklist, comments);
  // 每篇只在第一次分析、或留言讓等級改變時輸出，方便對照頭像上的提示。
  if (result.level !== previous?.level) {
    const log = result.level === 'unknown' ? console.debug : console.info;
    log(
      `[ScamLens] ${result.level} @${post.authorHandle}${previous ? '（依留言更新）' : ''}`,
      post.postUrl,
      result.signals,
      post
    );
  }
  return result;
};

const markAccount = async (post: PostSnapshot, container?: Element) => {
  const { authorHandle, postUrl } = post;
  const result = await results.get(post.postId);
  if (result && recordPostRisk(authorHandle, postUrl, result)) {
    // 帳號第一次被標示：畫面上這個帳號的其他貼文、留言也補上提示。
    findPostContainers()
      .filter((el) => getPostAuthor(el) === authorHandle)
      .forEach((el) =>
        syncAccountBadge(el, authorHandle, getAccountRisk(authorHandle))
      );
    return;
  }
  if (container) {
    syncAccountBadge(container, authorHandle, getAccountRisk(authorHandle));
  }
};

const addReply = (postId: string, reply: PostSnapshot) => {
  const list = replies.get(postId) ?? new Map<string, PostSnapshot>();
  replies.set(postId, list);
  if (list.has(reply.postId)) return;
  list.set(reply.postId, reply);
  // 主貼文還沒分析時，之後分析會一起算進這則留言。
  const post = posts.get(postId);
  const previous = results.get(postId);
  if (!post || !previous) return;
  // 接在上一次判定之後依序重算，舊結果不會蓋掉新結果。
  results.set(
    postId,
    previous.then((result) => analyze(post, result))
  );
  markAccount(post);
};

observeThreadsFeed((post, container) => {
  posts.set(post.postId, post);
  if (!results.has(post.postId)) results.set(post.postId, analyze(post));
  markAccount(post, container);
  // 留言本身也照一般貼文判定（標示留言者），同時當作主貼文的社群反應。
  const repliedPostId = getRepliedPostId(container);
  if (repliedPostId) addReply(repliedPostId, post);
});
