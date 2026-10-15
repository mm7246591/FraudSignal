import type { PostSnapshot } from '@/types/post';
import type { RiskResult } from '@/types/risk';
import type { Settings } from '@/types/settings';
import { evaluatePost, loadBlocklist } from '@/engine/riskEngine';
import {
  DEFAULT_SETTINGS,
  loadStoredRisks,
  onSettingsChanged,
  saveStoredPost,
} from '@/utils/riskStorage';
import { getAccountRisk, recordPostRisk, restoreIgnored } from './accountRisks';
import { recognizeImages } from './imageText';
import { clearBadges, setDisplay, syncAccountBadge } from './mountRiskAlert';
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
// postId → 照片辨識出的文字（docs/risk-rules.md 第 7 節）。
const imageTexts = new Map<string, string>();
// 設定頁的偵測開關（US-03 暫停偵測）；暫停時停止觀察貼文，stopFeed 為 undefined。
let enabled = false;
let stopFeed: (() => void) | undefined;

const analyze = async (post: PostSnapshot, previous?: RiskResult) => {
  // 清單載入失敗時退回只用本地規則（規格 9）。
  const blocklist = post.outboundUrls.length
    ? await loadBlocklist().catch(() => undefined)
    : undefined;
  const comments = [...(replies.get(post.postId)?.values() ?? [])];
  const imageText = imageTexts.get(post.postId);
  const result = evaluatePost(post, blocklist, comments, imageText);
  // 每篇只在第一次分析、或留言／圖片文字讓等級改變時輸出，方便對照頭像上的提示。
  if (result.level !== previous?.level) {
    const log = result.level === 'unknown' ? console.debug : console.info;
    log(
      `[ScamLens] ${result.level} @${post.authorHandle}${previous ? '（依留言或圖片文字更新）' : ''}`,
      post.postUrl,
      result.signals,
      { ...post, imageText }
    );
  }
  // ponytail: 沒風險的不存，本地規則重算比讀寫 storage 快；圖片辨識很慢，辨識過的一律存。
  if (result.level !== 'unknown' || imageText !== undefined) {
    const { postId, authorHandle, postUrl } = post;
    saveStoredPost({ postId, authorHandle, postUrl, imageText, result }).catch(
      (error) => console.debug('[ScamLens] 判定儲存失敗', error)
    );
  }
  return result;
};

const markAccount = async (post: PostSnapshot, container?: Element) => {
  const { authorHandle, postUrl } = post;
  const result = await results.get(post.postId);
  const first =
    result !== undefined && recordPostRisk(authorHandle, postUrl, result);
  // 暫停時進行中的分析照樣記錄，只是不掛標示；恢復後重新掃描會補上。
  if (!enabled) return;
  if (first) {
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

/** 留言或圖片文字增加時重新判定；還沒分析過的貼文，之後分析會一起算進去。 */
const reanalyze = (postId: string) => {
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

const addReply = (postId: string, reply: PostSnapshot) => {
  const list = replies.get(postId) ?? new Map<string, PostSnapshot>();
  replies.set(postId, list);
  if (list.has(reply.postId)) return;
  list.set(reply.postId, reply);
  reanalyze(postId);
};

// 先用內文判定、馬上顯示（規格 2.3 警告延遲 1 秒內），圖片辨識完再重新判定。
const readImages = async ({ postId, imageUrls }: PostSnapshot) => {
  const text = await recognizeImages(imageUrls);
  if (text === undefined) return;
  imageTexts.set(postId, text);
  reanalyze(postId);
};

const onPost = (post: PostSnapshot, container: Element) => {
  posts.set(post.postId, post);
  if (!results.has(post.postId)) {
    results.set(post.postId, analyze(post));
    if (post.imageUrls.length) readImages(post);
  }
  markAccount(post, container);
  // 留言本身也照一般貼文判定（標示留言者），同時當作主貼文的社群反應。
  const repliedPostId = getRepliedPostId(container);
  if (repliedPostId) addReply(repliedPostId, post);
};

/** 依目前設定重新同步畫面上所有貼文的標示（切換「顯示已檢查」時補上或移除灰色標示）。 */
const syncAllBadges = () => {
  findPostContainers().forEach((el) => {
    const handle = getPostAuthor(el);
    if (handle) syncAccountBadge(el, handle, getAccountRisk(handle));
  });
};

// 設定頁改了就生效：暫停時停止觀察並移除標示；恢復時重新掃描，畫面上的貼文會補回標示。
const applySettings = (settings: Settings) => {
  setDisplay(settings);
  ({ enabled } = settings);
  if (enabled) {
    stopFeed ??= observeThreadsFeed(onPost);
    syncAllBadges();
    return;
  }
  stopFeed?.();
  stopFeed = undefined;
  clearBadges();
};

const start = async () => {
  // 讀不到快取時照常偵測，只是沒有之前的標示（規格 9：例外不阻斷原站）。
  const stored = await loadStoredRisks().catch((error) => {
    console.debug('[ScamLens] 快取讀取失敗', error);
    return { posts: [], ignoredAccounts: [], settings: DEFAULT_SETTINGS };
  });
  restoreIgnored(stored.ignoredAccounts);
  // 快取的貼文不再重新分析（US-04），帳號標示先建好，看到該帳號的貼文就會掛上。
  stored.posts.forEach(
    ({ postId, authorHandle, postUrl, imageText, result }) => {
      results.set(postId, Promise.resolve(result));
      if (imageText !== undefined) imageTexts.set(postId, imageText);
      recordPostRisk(authorHandle, postUrl, result);
    }
  );
  const flagged = stored.posts.filter(
    ({ result }) => result.level !== 'unknown'
  );
  if (flagged.length) {
    console.info(`[ScamLens] 從快取還原 ${flagged.length} 篇可疑貼文`, flagged);
  }

  applySettings(stored.settings);
  onSettingsChanged(applySettings);
};

start();
