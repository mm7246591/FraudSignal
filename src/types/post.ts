/** 規格 7：可見貼文的正規化資料。 */
type PostSnapshot = {
  platform: 'threads';
  postId: string;
  postUrl: string;
  authorHandle: string;
  visibleText: string;
  outboundUrls: string[];
  observedAt: number;
};

export type { PostSnapshot };
