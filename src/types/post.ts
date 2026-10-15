/** 規格 7：可見貼文的正規化資料。 */
type PostSnapshot = {
  platform: 'threads';
  postId: string;
  postUrl: string;
  authorHandle: string;
  visibleText: string;
  outboundUrls: string[];
  /** 貼文照片，之後辨識圖片文字用（docs/risk-rules.md 第 7 節）。 */
  imageUrls: string[];
  observedAt: number;
};

export type { PostSnapshot };
