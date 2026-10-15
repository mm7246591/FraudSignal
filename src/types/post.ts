/** 支援的平台；manifest 只注入 threads.com 與 x.com。 */
type Platform = 'threads' | 'x';

/** 規格 7：可見貼文的正規化資料。 */
type PostSnapshot = {
  platform: Platform;
  postId: string;
  postUrl: string;
  authorHandle: string;
  visibleText: string;
  outboundUrls: string[];
  /** 貼文照片，之後辨識圖片文字用（docs/risk-rules.md 第 7 節）。 */
  imageUrls: string[];
  observedAt: number;
};

/** 貼文或留言；單篇貼文頁主貼文下方、其他帳號的回覆算留言，作者自己的回覆（串文）與其他頁面都算貼文。 */
type PostKind = 'post' | 'reply';

export type { Platform, PostSnapshot, PostKind };
