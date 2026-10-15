import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setup = async () => {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  vi.stubGlobal('window', { setTimeout });
  const { recognizeImages } = await import('@/content/imageText');
  return { sendMessage, recognizeImages };
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('圖片辨識佇列', () => {
  it('context 失效的同步拋錯不會造成未處理拒絕或卡住佇列', async () => {
    const { sendMessage, recognizeImages } = await setup();
    sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    await expect(recognizeImages(['first', 'second'])).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    sendMessage.mockResolvedValue({ text: '保證獲利' });
    await expect(recognizeImages(['third'])).resolves.toBe('保證獲利');
  });

  it('非同步失敗不會中斷其餘圖片的辨識', async () => {
    const { sendMessage, recognizeImages } = await setup();
    sendMessage
      .mockRejectedValueOnce(new Error('message failed'))
      .mockResolvedValue({ text: '圖片文字' });
    await expect(recognizeImages(['first', 'second'])).resolves.toBe(
      '圖片文字'
    );
  });

  it('逾時後可繼續處理下一張', async () => {
    const { sendMessage, recognizeImages } = await setup();
    sendMessage
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ text: '下一張' });
    const result = recognizeImages(['first', 'second']);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('下一張');
  });
});
