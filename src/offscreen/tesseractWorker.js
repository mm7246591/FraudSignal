/* eslint-env worker */
// Tesseract worker 的外層，網址參數 worker 是真正的 worker.min.js。
// 中文語言檔帶了舊引擎的參數，LSTM 版核心沒有，每次初始化都用 console.error 印 8 行
// 「Warning: Parameter not found」，會被列進擴充功能的「錯誤」頁；辨識不受影響。
// 改用含舊引擎的完整核心可以消掉警告，但實測辨識慢約 6 倍，所以濾掉這一種訊息。
// 過窄的文字區塊無法辨識是局部診斷，轉成 debug 保留線索，其他錯誤照常回報。
const { error } = console;
console.error = (...args) => {
  const message = String(args[0]).trim();
  if (message.startsWith('Warning: Parameter not found:')) return;
  if (
    /^Image too small to scale!! \(\d+x\d+ vs min width of \d+\)$/.test(
      message
    ) ||
    message === 'Line cannot be recognized!!'
  ) {
    console.debug(...args);
    return;
  }
  error(...args);
};
importScripts(new URL(globalThis.location.href).searchParams.get('worker'));
