/**
 * 圖片文字辨識的訊息（docs/risk-rules.md 第 7 節）：
 * content script 送 ocr 給背景，背景確認離屏頁存在後改送 ocr-offscreen 給離屏頁辨識。
 */
type OcrRequest = { type: 'ocr' | 'ocr-offscreen'; url: string };

type OcrResponse = { text: string } | { error: string };

export type { OcrRequest, OcrResponse };
