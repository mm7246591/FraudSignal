import { createWorker, OEM } from 'tesseract.js';
// eslint-disable-next-line import/extensions -- 取套件內檔案的網址，不是匯入模組
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
// ponytail: 直接指定 SIMD 版核心（Chrome 91 起都支援），不打包另外三個變體；要支援更舊的瀏覽器再改成資料夾。
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import type { OcrRequest, OcrResponse } from '@/types/ocr';
// 檔案很小，不加 no-inline 會被內嵌成 data: 網址，worker 網址就不能帶參數。
// eslint-disable-next-line import/extensions -- 取檔案網址，不是匯入模組
import wrapperUrl from './tesseractWorker.js?url&no-inline';

// 檔案都打包在擴充功能裡，不從 CDN 載入（MV3 不允許遠端程式碼）。
// 語言檔放 public/tessdata：Tesseract 依「langPath/語言.traineddata.gz」組網址，檔名不能加 hash。
let workerPromise: ReturnType<typeof createWorker> | undefined;

const absolute = (url: string) => new URL(url, window.location.href);

// 外層濾掉初始化警告，見 tesseractWorker.js。開發模式的網址本身帶 ?no-inline，用 URL 加參數才不會出現兩個「?」。
const wrapperPath = absolute(wrapperUrl);
wrapperPath.searchParams.set('worker', absolute(workerUrl).href);

const getWorker = () => {
  workerPromise ??= createWorker('chi_tra', OEM.LSTM_ONLY, {
    workerPath: wrapperPath.href,
    corePath: absolute(coreUrl).href,
    langPath: chrome.runtime.getURL('tessdata'),
    // 預設用 blob: 網址開 worker，擴充功能的 CSP 不允許。
    workerBlobURL: false,
    cacheMethod: 'none',
  }).catch((error) => {
    workerPromise = undefined;
    throw error;
  });
  return workerPromise;
};

// Tesseract 會在中文字之間加空白，去掉後證據比較好讀；換行保留。
const tidy = (text: string) =>
  text.replace(/(?<=\p{Script=Han})[^\S\n]+(?=\p{Script=Han})/gu, '').trim();

// 同一個 worker 的工作依序執行，一次只辨識一張。
chrome.runtime.onMessage.addListener(
  (message: OcrRequest, _sender, sendResponse) => {
    if (message?.type !== 'ocr-offscreen') return false;
    getWorker()
      .then((worker) => worker.recognize(message.url))
      .then(
        ({ data }) =>
          sendResponse({ text: tidy(data.text) } satisfies OcrResponse),
        (error) => sendResponse({ error: String(error) } satisfies OcrResponse)
      );
    return true;
  }
);
