import type { PostSnapshot } from '@/types/post';
import { observeFeed } from './observeFeed';
import type { PlatformAdapter } from './platform';

const POST_SELECTOR = '[data-pressable-container="true"]';
const POST_PATH = /^\/@([^/]+)\/post\/([^/?#]+)/;
const THREADS_HOST = /(^|\.)threads\.(com|net)$/;
const REDIRECT_HOST = /^l\.threads\.(com|net)$/;
// 作者、話題標籤、時間、互動數都在這些元素內，不算內文。
const NON_BODY = 'a, time, [role="button"]';
// 貼文照片在 <picture> 內；頭像、影片縮圖不是（2026-10-15 實測）。
const PHOTO_SELECTOR = 'picture img';
// 圖片文字辨識用的寬度上限：1080 夠看清小字，再大只會變慢。
const OCR_WIDTH = 1080;

/** 外部連結：解開 l.threads.com 轉址；站內或非 http(s) 連結回傳 null。 */
const toOutboundUrl = (href: string): string | null => {
  let url: URL;
  try {
    url = new URL(href, 'https://www.threads.com');
  } catch {
    return null;
  }
  if (REDIRECT_HOST.test(url.hostname)) {
    const target = url.searchParams.get('u');
    return target ? toOutboundUrl(target) : null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  return THREADS_HOST.test(url.hostname) ? null : url.href;
};

/**
 * 從 srcset 挑寬度不超過 OCR_WIDTH 的最大張；都比較大時挑最小張，沒有 srcset 時回傳 undefined。
 * Threads 的 srcset 以「 1080w,」分隔，逗號後沒有空白，網址本身不含空白。
 */
const pickSrcsetUrl = (srcset: string) => {
  const candidates = [...srcset.matchAll(/([^\s,]\S*)\s+(\d+)w/g)]
    .map(([, url, width]) => ({ url, width: Number(width) }))
    .sort((a, b) => b.width - a.width);
  return (
    candidates.find(({ width }) => width <= OCR_WIDTH) ?? candidates.at(-1)
  )?.url;
};

const getImageUrls = (container: Element) => [
  ...new Set(
    [...container.querySelectorAll<HTMLImageElement>(PHOTO_SELECTOR)]
      .map((img) => pickSrcsetUrl(img.srcset) ?? img.currentSrc)
      .filter(Boolean)
  ),
];

// 標頭列：time 往上第一個也包含作者連結的元素，內有「· 作者」標籤、話題與時間。
const getHeaderRow = (
  container: Element,
  time: Element,
  authorHandle: string
) => {
  let el = time.parentElement;
  while (el && el !== container) {
    if (el.querySelector(`a[href="/@${authorHandle}"]`)) return el;
    el = el.parentElement;
  }
  return null;
};

// 內文不一定有 div[lang]（沒有翻譯按鈕時就沒有），改以 span[dir=auto] 排除非內文區塊。
const getVisibleText = (container: Element, header: Element | null) =>
  [...container.querySelectorAll<HTMLElement>('span[dir="auto"]')]
    .filter(
      (span) =>
        !span.closest(NON_BODY) &&
        !span.parentElement?.closest('span[dir="auto"]') &&
        !span.querySelector('time') &&
        !header?.contains(span)
    )
    .map((span) => {
      // 「翻譯」按鈕在內文 span 裡，整行比對移除。
      const buttonTexts = new Set(
        [...span.querySelectorAll<HTMLElement>('[role="button"]')].map(
          (button) => button.innerText.trim()
        )
      );
      return span.innerText
        .split('\n')
        .filter((line) => !buttonTexts.has(line.trim()))
        .join('\n')
        .trim();
    })
    .filter(Boolean)
    .join('\n');

const extractPost = (container: Element): PostSnapshot | null => {
  // 時間連結指向貼文本身：/@handle/post/ID
  const time = container.querySelector('time');
  const match = POST_PATH.exec(time?.closest('a')?.getAttribute('href') ?? '');
  if (!time || !match) {
    console.debug('[FraudSignal] skip: 找不到貼文連結', container);
    return null;
  }
  const [, authorHandle, postId] = match;
  const visibleText = getVisibleText(
    container,
    getHeaderRow(container, time, authorHandle)
  );
  const outboundUrls = [
    ...new Set(
      [...container.querySelectorAll('a[href]')]
        .map((a) => toOutboundUrl(a.getAttribute('href') ?? ''))
        .filter((url): url is string => url !== null)
    ),
  ];
  const imageUrls = getImageUrls(container);
  if (!visibleText && !outboundUrls.length && !imageUrls.length) {
    console.debug('[FraudSignal] skip: 沒有文字、外部連結或照片', container);
    return null;
  }
  return {
    platform: 'threads',
    postId,
    postUrl: `https://www.threads.com/@${authorHandle}/post/${postId}`,
    authorHandle,
    visibleText,
    outboundUrls,
    imageUrls,
    observedAt: Date.now(),
  };
};

// 首頁動態與他人帳號頁（個人頁、單篇貼文含留言）；搜尋、活動、設定等頁面不處理。
const isSupportedPage = () => {
  const { pathname } = window.location;
  return pathname === '/' || pathname.startsWith('/@');
};

const findPostContainers = () => [...document.querySelectorAll(POST_SELECTOR)];

const getPostLink = (container: Element) =>
  POST_PATH.exec(
    container.querySelector('time')?.closest('a')?.getAttribute('href') ?? ''
  );

const getPostAuthor = (container: Element) => getPostLink(container)?.[1];

/**
 * 單篇貼文頁上的留言：跟主貼文在同一個對話區塊、排在主貼文之後（之前的是上層串文），回傳主貼文 postId。
 * 不在單篇貼文頁、找不到主貼文或不是留言時回傳 undefined。
 */
const getRepliedPostId = (container: Element) => {
  const postId = POST_PATH.exec(window.location.pathname)?.[2];
  if (!postId) return undefined;
  // querySelectorAll 依文件順序排列。
  const containers = findPostContainers();
  const main = containers.find((el) => getPostLink(el)?.[2] === postId);
  // 對話區塊是主貼文往上第一個有多個子元素的祖先（2026-10-15 實測，含沒有留言的貼文）；
  // 下方「相關串文」推薦在區塊外，不算留言。
  let thread = main?.parentElement;
  while (thread && thread.childElementCount < 2) thread = thread.parentElement;
  // ponytail: 留言的留言也算主貼文的留言；要區分再看縮排層級。
  return main &&
    thread?.contains(container) &&
    containers.indexOf(container) > containers.indexOf(main)
    ? postId
    : undefined;
};

/**
 * 作者頭像外框（36×36 的 div，包住頭像連結），提示掛在它右下角。
 * 找不到（節點已換成別人的貼文）時回傳 null。
 */
const getAvatarFrame = (container: Element, authorHandle: string) =>
  [...container.querySelectorAll(`a[href="/@${authorHandle}"]`)].find((link) =>
    link.querySelector('img')
  )?.parentElement ?? null;

const threadsAdapter: PlatformAdapter = {
  platform: 'threads',
  getAvatarFrame,
  findPostContainers,
  getPostAuthor,
  getRepliedPostId,
  observeFeed: (onPost) =>
    observeFeed(
      { selector: POST_SELECTOR, isSupportedPage, extractPost },
      onPost
    ),
};

export { toOutboundUrl, pickSrcsetUrl, threadsAdapter };
