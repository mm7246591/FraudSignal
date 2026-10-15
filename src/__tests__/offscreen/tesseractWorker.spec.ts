/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../offscreen/tesseractWorker.js', import.meta.url),
  'utf8'
);

const setup = () => {
  const error = vi.fn();
  const debug = vi.fn();
  const workerConsole = { error, debug };
  const importScripts = vi.fn();
  runInNewContext(source, {
    console: workerConsole,
    URL,
    location: {
      href: 'chrome-extension://test/wrapper.js?worker=chrome-extension%3A%2F%2Ftest%2Fworker.min.js',
    },
    importScripts,
  });
  return { error, debug, workerConsole, importScripts };
};

describe('Tesseract worker 診斷', () => {
  it('只將已知的區塊辨識診斷轉成 debug', () => {
    const { error, debug, workerConsole } = setup();
    const messages = [
      'Image too small to scale!! (2x48 vs min width of 3)',
      'Image too small to scale!! (1x36 vs min width of 3)\n',
      'Line cannot be recognized!!\n',
    ];
    messages.forEach((message) => workerConsole.error(message));
    expect(error).not.toHaveBeenCalled();
    expect(debug.mock.calls).toEqual(messages.map((message) => [message]));
  });

  it('保留其他錯誤與附帶資訊', () => {
    const { error, debug, workerConsole } = setup();
    const detail = { jobId: 'failed' };
    workerConsole.error('Failed to load image', detail);
    workerConsole.error('Line cannot be recognized!! Unexpected failure');
    expect(error.mock.calls).toEqual([
      ['Failed to load image', detail],
      ['Line cannot be recognized!! Unexpected failure'],
    ]);
    expect(debug).not.toHaveBeenCalled();
  });

  it('維持初始化警告過濾與真正 worker 的載入', () => {
    const { error, debug, workerConsole, importScripts } = setup();
    workerConsole.error(
      'Warning: Parameter not found: textord_testregion_left'
    );
    expect(error).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    expect(importScripts).toHaveBeenCalledExactlyOnceWith(
      'chrome-extension://test/worker.min.js'
    );
  });
});
