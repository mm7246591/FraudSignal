import type { PostSnapshot } from '@/types/post';
import { observeFeed } from './observeFeed';
import type { PlatformAdapter } from './platform';

// 2026-10-15 實測，X 有兩種網頁，每篇貼文都是 <article>：
// - 登入後（舊版）：有 data-testid 與 <time>；引用的貼文是 div[role=link] 卡片，頭像是背景圖、沒有 <img>。
// - 未登入（新版）：沒有 data-testid 也沒有 <time>；引用的貼文是裡面的另一個 <article>。
// 只用兩版都有的結構，兩版不同的地方分別處理。
const POST_SELECTOR = 'article';
// 時間連結 /帳號/status/ID；廣告沒有時間，改用照片或統計連結（/photo/1、/analytics）。
const POST_PATH =
  /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/(?:photo|video)\/\d+|\/analytics)?$/;
// 首頁動態與他人帳號頁（個人頁、回覆、媒體分頁、單篇貼文含留言），跟 Threads 一致。
const PAGE_PATH =
  /^\/([A-Za-z0-9_]{1,15})(?:\/(?:status\/\d+|with_replies|media|highlights))?\/?$/;
// 跟帳號同格式、但不是個人頁的站內路徑。
const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'settings',
  'search',
  'i',
  'compose',
  'bookmarks',
  'jobs',
  'communities',
  'lists',
  'premium',
]);
const X_HOST = /(^|\.)(x|twitter)\.com$/;
// t.co 短網址看不到目的地，改看畫面上顯示的網址：內文「go.nasa.gov/4i6Xa9I」「example.com/pa…」、
// 連結卡片「從 bbc.com」（英文介面「From bbc.com」）。卡片標題這類一般文字不算。
const SHOWN_URL =
  /^(?:\S+\s+)?((?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?)$/i;
// 貼文照片；頭像（profile_images）、卡片縮圖（card_img）、影片縮圖不在這個路徑。
const PHOTO_PATH = /^\/media\//;

/** 外部連結：t.co 改用畫面上顯示的網址；站內、非 http(s) 或看不出目的地的連結回傳 null。 */
const toOutboundUrl = (href: string, shownText: string): string | null => {
  let url: URL;
  try {
    url = new URL(href, 'https://x.com');
  } catch {
    return null;
  }
  if (url.hostname === 't.co') {
    const shown = SHOWN_URL.exec(shownText.trim().replace(/…$/, ''))?.[1];
    if (!shown) return null;
    return toOutboundUrl(
      /^https?:\/\//i.test(shown) ? shown : `https://${shown}`,
      ''
    );
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  return X_HOST.test(url.hostname) ? null : url.href;
};

/**
 * 貼文照片改用 jpg、1200px 寬（name=medium）辨識文字：預設的 webp 不確定 Tesseract 能讀，
 * 680px（small）看不清小字。不是貼文照片時回傳 null。
 */
const toPhotoUrl = (src: string) => {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.hostname !== 'pbs.twimg.com' || !PHOTO_PATH.test(url.pathname)) {
    return null;
  }
  url.searchParams.set('format', 'jpg');
  url.searchParams.set('name', 'medium');
  return url.href;
};

const isSupportedPath = (pathname: string) => {
  if (pathname === '/home') return true;
  const handle = PAGE_PATH.exec(pathname)?.[1];
  return handle !== undefined && !RESERVED_PATHS.has(handle.toLowerCase());
};

/** 屬於這篇貼文的元素，不含引用的貼文（新版的內層 article、舊版的 div[role=link] 卡片）。 */
const ownElements = <T extends Element>(container: Element, selector: string) =>
  [...container.querySelectorAll<T>(selector)].filter((el) => {
    if (el.closest(POST_SELECTOR) !== container) return false;
    // 新版單篇貼文頁的留言外面也包著 div[role=link]，所以只看貼文裡面的。
    const quote = el.closest('div[role="link"]');
    return !quote || !container.contains(quote);
  });

// 引用的貼文已排除，第一個連結就是這篇的。
const getPostLink = (container: Element) =>
  ownElements(container, 'a[href*="/status/"]')
    .map((a) => POST_PATH.exec(a.getAttribute('href') ?? ''))
    .find(Boolean) ?? null;

const extractPost = (container: Element): PostSnapshot | null => {
  const match = getPostLink(container);
  if (!match) {
    console.debug('[FraudSignal] skip: 找不到貼文連結', container);
    return null;
  }
  const [, authorHandle, postId] = match;
  // 內文在 div[dir=auto]；作者名稱、時間、連結卡片標題不在裡面。
  const visibleText = ownElements<HTMLElement>(container, 'div[dir="auto"]')
    .filter((el) => !el.parentElement?.closest('div[dir="auto"]'))
    .map((el) => el.innerText.trim())
    .filter(Boolean)
    .join('\n');
  // textContent 才讀得到舊版隱藏的「https://」與網址後段。
  const outboundUrls = [
    ...new Set(
      ownElements(container, 'a[href]')
        .map((a) =>
          toOutboundUrl(a.getAttribute('href') ?? '', a.textContent ?? '')
        )
        .filter((url): url is string => url !== null)
    ),
  ];
  const imageUrls = [
    ...new Set(
      ownElements<HTMLImageElement>(container, 'img')
        .map((img) => toPhotoUrl(img.currentSrc || img.src))
        .filter((url): url is string => url !== null)
    ),
  ];
  if (!visibleText && !outboundUrls.length && !imageUrls.length) {
    console.debug('[FraudSignal] skip: 沒有文字、外部連結或照片', container);
    return null;
  }
  return {
    platform: 'x',
    postId,
    postUrl: `https://x.com/${authorHandle}/status/${postId}`,
    authorHandle,
    visibleText,
    outboundUrls,
    imageUrls,
    observedAt: Date.now(),
  };
};

const findPostContainers = (): Element[] => [
  ...document.querySelectorAll(POST_SELECTOR),
];

const getPostAuthor = (container: Element) => getPostLink(container)?.[1];

/** b 在文件中排在 a 之後。 */
const isAfter = (a: Node, b: Node) =>
  // eslint-disable-next-line no-bitwise -- compareDocumentPosition 回傳位元旗標
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * 單篇貼文頁上的留言：跟主貼文在同一個清單、排在主貼文之後（之前的是上層串文），回傳主貼文 postId。
 * 清單在舊版是對話時間軸（每則一個 cellInnerDiv），新版是 ul。引用的貼文不算留言。
 */
const getRepliedPostId = (container: Element) => {
  const postId = POST_PATH.exec(window.location.pathname)?.[2];
  if (!postId || container.parentElement?.closest(POST_SELECTOR)) {
    return undefined;
  }
  // querySelectorAll 依文件順序排列。
  const containers = findPostContainers();
  const main = containers.find((el) => getPostLink(el)?.[2] === postId);
  const list =
    main?.closest('[data-testid="cellInnerDiv"]')?.parentElement ??
    main?.closest('ul');
  if (
    !main ||
    !list?.contains(container) ||
    containers.indexOf(container) <= containers.indexOf(main)
  ) {
    return undefined;
  }
  // 留言後面的「探索更多」推薦前面有標題，標題之後的不算留言。
  // ponytail: 2026-10-15 登入實測的貼文沒出現「探索更多」，標題結構是推測，看到誤判再修。
  const heading = [...list.querySelectorAll('h2, [role="heading"]')].find(
    (el) => isAfter(main, el) && !main.contains(el)
  );
  return heading && isAfter(heading, container) ? undefined : postId;
};

/**
 * 作者頭像外框，寬度等於頭像直徑：舊版是 UserAvatar-Container-帳號（40×40，頭像是背景圖），
 * 新版是包住頭像連結的 div（寬 40，高度會隨串文的連接線拉長）。找不到時回傳 null。
 */
const getAvatarFrame = (container: Element, authorHandle: string) =>
  ownElements<HTMLElement>(
    container,
    `[data-testid="UserAvatar-Container-${authorHandle}"]`
  )[0] ??
  ownElements(container, `a[href="/${authorHandle}"]`).find((link) =>
    link.querySelector('img')
  )?.parentElement ??
  null;

const xAdapter: PlatformAdapter = {
  platform: 'x',
  getAvatarFrame,
  findPostContainers,
  getPostAuthor,
  getRepliedPostId,
  observeFeed: (onPost) =>
    observeFeed(
      {
        selector: POST_SELECTOR,
        isSupportedPage: () => isSupportedPath(window.location.pathname),
        extractPost,
      },
      onPost
    ),
};

export { toOutboundUrl, toPhotoUrl, isSupportedPath, xAdapter };
