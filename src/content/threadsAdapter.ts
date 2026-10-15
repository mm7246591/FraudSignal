import type { PostSnapshot } from '@/types/post';

const POST_SELECTOR = '[data-pressable-container="true"]';
const POST_PATH = /^\/@([^/]+)\/post\/([^/?#]+)/;
const THREADS_HOST = /(^|\.)threads\.(com|net)$/;
const REDIRECT_HOST = /^l\.threads\.(com|net)$/;
// 作者、話題標籤、時間、互動數都在這些元素內，不算內文。
const NON_BODY = 'a, time, [role="button"]';

/** 外部連結：解開 l.threads.com 轉址；站內或非 http(s) 連結回傳 null。 */
export const toOutboundUrl = (href: string): string | null => {
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
    console.debug('[ScamLens] skip: 找不到貼文連結', container);
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
  if (!visibleText && !outboundUrls.length) {
    console.debug('[ScamLens] skip: 沒有文字或外部連結', container);
    return null;
  }
  return {
    platform: 'threads',
    postId,
    postUrl: `https://www.threads.com/@${authorHandle}/post/${postId}`,
    authorHandle,
    visibleText,
    outboundUrls,
    observedAt: Date.now(),
  };
};

// 首頁動態與他人帳號頁（個人頁、單篇貼文含留言）；搜尋、活動、設定等頁面不處理。
const isSupportedPage = () => {
  const { pathname } = window.location;
  return pathname === '/' || pathname.startsWith('/@');
};

/**
 * 貼文每次進入視窗都回呼（Threads 會重新渲染節點）；去重由呼叫端以 postId 處理。
 * DOM 變動批次掃描。回傳停止函式。
 */
export const observeThreadsFeed = (
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
      .querySelectorAll(POST_SELECTOR)
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
