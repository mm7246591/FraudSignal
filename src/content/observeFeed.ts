import type { PostSnapshot } from '@/types/post';

/** 平台 Adapter 提供的貼文來源。 */
type FeedSource = {
  /** 每篇貼文的外框。 */
  selector: string;
  /** 目前頁面是否偵測（首頁、他人帳號頁等）。 */
  isSupportedPage: () => boolean;
  /** 讀出貼文；不是貼文或沒有內容時回傳 null。 */
  extractPost: (container: Element) => PostSnapshot | null;
};

/**
 * 貼文每次進入視窗都回呼（平台會重新渲染節點，提示要能補回）；去重由呼叫端以 postId 處理。
 * DOM 變動批次掃描。回傳停止函式。
 */
const observeFeed = (
  { selector, isSupportedPage, extractPost }: FeedSource,
  onPost: (post: PostSnapshot, container: Element) => void
) => {
  const intersection = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.target.isConnected) {
        intersection.unobserve(entry.target);
        return;
      }
      if (!entry.isIntersecting || !isSupportedPage()) return;
      const post = extractPost(entry.target);
      // ponytail: 停留在視窗內時被換內容的節點會漏掉，要處理再改監聽節點內容變動。
      if (post) onPost(post, entry.target);
    });
  });

  const scan = () => {
    if (!isSupportedPage()) return;
    // 重複 observe 同一節點不會有作用，不另外記錄。
    document
      .querySelectorAll(selector)
      .forEach((el) => intersection.observe(el));
  };

  let scheduled = false;
  const mutation = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      scan();
    }, 200);
  });

  scan();
  mutation.observe(document.body, { childList: true, subtree: true });
  return () => {
    mutation.disconnect();
    intersection.disconnect();
  };
};

export { observeFeed };
export type { FeedSource };
