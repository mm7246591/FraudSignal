import type { OcrRequest, OcrResponse } from '@/types/ocr';

// 每篇最多辨識幾張：詐騙圖卡的重點通常在前面，輪播十張全辨識太吃 CPU。
const MAX_IMAGES = 3;
// 離屏頁沒回應時放棄這張，不卡住後面的佇列。
const TIMEOUT_MS = 30_000;

// 一次只送一張（規格 9 限制同時分析數）。後進先出：快速捲動時先辨識剛進入畫面的貼文。
// ponytail: 已離開畫面的貼文仍會辨識，要更省 CPU 再改成可取消。
const queue: (() => Promise<void>)[] = [];
let running = false;

const next = () => {
  const task = queue.pop();
  running = Boolean(task);
  task?.().finally(next);
};

const recognize = (url: string) =>
  new Promise<string | undefined>((resolve) => {
    queue.push(async () => {
      const timeout = new Promise<undefined>((done) => {
        window.setTimeout(done, TIMEOUT_MS);
      });
      const response = (await Promise.race([
        // 擴充功能重載後，舊 content script 的 sendMessage 會同步拋錯。
        Promise.resolve().then(() =>
          chrome.runtime.sendMessage({ type: 'ocr', url } satisfies OcrRequest)
        ),
        timeout,
      ]).catch((error) => ({ error: String(error) }))) as
        OcrResponse | undefined;
      if (response && 'text' in response) {
        resolve(response.text);
        return;
      }
      console.debug('[FraudSignal] 圖片文字辨識失敗', url, response);
      resolve(undefined);
    });
    if (!running) next();
  });

/** 辨識貼文照片的文字，合併成一段；全部失敗時回傳 undefined，下次載入頁面再試。 */
const recognizeImages = async (urls: string[]) => {
  const texts = await Promise.all(urls.slice(0, MAX_IMAGES).map(recognize));
  const ok = texts.filter((text): text is string => text !== undefined);
  return ok.length ? ok.join('\n') : undefined;
};

export { recognizeImages };
