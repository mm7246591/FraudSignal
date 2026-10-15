import type { OcrRequest, OcrResponse } from '@/types/ocr';

// content script 不能開擴充功能的 worker，Tesseract 放在離屏頁執行；背景只負責建立離屏頁並轉送。
let creating: Promise<void> | undefined;

const ensureOffscreen = async () => {
  if (await chrome.offscreen.hasDocument()) return;
  // 同時多個請求只建立一次；建立失敗下次重試。
  creating ??= chrome.offscreen
    .createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: '在本機辨識貼文圖片中的文字',
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
};

chrome.runtime.onMessage.addListener(
  (message: OcrRequest, _sender, sendResponse) => {
    if (message?.type !== 'ocr') return false;
    ensureOffscreen()
      .then(
        () =>
          chrome.runtime.sendMessage({
            type: 'ocr-offscreen',
            url: message.url,
          } satisfies OcrRequest) as Promise<OcrResponse>
      )
      .then(sendResponse, (error) => sendResponse({ error: String(error) }));
    return true;
  }
);
