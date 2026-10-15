import type { PostSnapshot } from '@/types/post';
import type { RiskResult } from '@/types/risk';
import { evaluatePost, loadBlocklist } from '@/utils/riskEngine';
import { getAccountRisk, recordPostRisk } from './accountRisks';
import { syncAccountBadge } from './mountRiskAlert';
import { loadStoredRisks, saveStoredPost } from './riskStorage';
import {
  findPostContainers,
  getPostAuthor,
  getRepliedPostId,
  observeThreadsFeed,
} from './threadsAdapter';

// postId → 判定；有風險的另存 chrome.storage.local，重新整理後還原。
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
  // ponytail: 沒風險的不存，本地規則重算比讀寫 storage 快；加入 AI／網址查詢（規格 M3）再存。
  if (result.level !== 'unknown') {
    const { postId, authorHandle, postUrl } = post;
    saveStoredPost({ postId, authorHandle, postUrl, result }).catch((error) =>
      console.debug('[ScamLens] 判定儲存失敗', error)
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

const start = async () => {
  // 讀不到快取時照常偵測，只是沒有之前的標示（規格 9：例外不阻斷原站）。
  const stored = await loadStoredRisks().catch((error) => {
    console.debug('[ScamLens] 快取讀取失敗', error);
    return { posts: [] };
  });
  // 快取的貼文不再重新分析（US-04），帳號標示先建好，看到該帳號的貼文就會掛上。
  stored.posts.forEach(({ postId, authorHandle, postUrl, result }) => {
    results.set(postId, Promise.resolve(result));
    recordPostRisk(authorHandle, postUrl, result);
  });
  if (stored.posts.length) {
    console.info(
      `[ScamLens] 從快取還原 ${stored.posts.length} 篇可疑貼文`,
      stored.posts
    );
  }

  observeThreadsFeed((post, container) => {
    posts.set(post.postId, post);
    if (!results.has(post.postId)) results.set(post.postId, analyze(post));
    markAccount(post, container);
    // 留言本身也照一般貼文判定（標示留言者），同時當作主貼文的社群反應。
    const repliedPostId = getRepliedPostId(container);
    if (repliedPostId) addReply(repliedPostId, post);
  });
};

start();
