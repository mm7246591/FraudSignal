import type { Platform, PostSnapshot } from '@/types/post';
import { threadsAdapter } from './threadsAdapter';
import { xAdapter } from './xAdapter';

/** 平台 Adapter：讀頁面的部分各平台不同，判定、標示與快取共用。 */
type PlatformAdapter = {
  platform: Platform;
  /** 作者頭像外框，寬度等於頭像直徑、頭像在頂端；提示掛在它右下角。找不到時回傳 null。 */
  getAvatarFrame: (
    container: Element,
    authorHandle: string
  ) => HTMLElement | null;
  /** 畫面上所有貼文外框，依文件順序。 */
  findPostContainers: () => Element[];
  getPostAuthor: (container: Element) => string | undefined;
  /** 單篇貼文頁上的留言回傳主貼文 postId，其他情況回傳 undefined。 */
  getRepliedPostId: (container: Element) => string | undefined;
  /** 開始觀察動態，回傳停止函式。 */
  observeFeed: (
    onPost: (post: PostSnapshot, container: Element) => void
  ) => () => void;
};

// manifest 只注入 threads.com 與 x.com。
const adapter: PlatformAdapter =
  window.location.hostname === 'x.com' ? xAdapter : threadsAdapter;

export { adapter };
export type { PlatformAdapter };
