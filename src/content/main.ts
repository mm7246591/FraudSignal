import { observeThreadsFeed } from './threadsAdapter';

// 先輸出擷取結果，確認抓得到貼文；風險判定在下一步加入。
const seen = new Set<string>();

observeThreadsFeed((post) => {
  if (seen.has(post.postId)) return;
  seen.add(post.postId);
  console.info(`[ScamLens] post @${post.authorHandle}`, post.postUrl, post);
});
