import { describe, expect, it } from 'vitest';
import { pickSrcsetUrl, toOutboundUrl } from '@/content/threadsAdapter';

describe('toOutboundUrl', () => {
  it('解開 l.threads.com 轉址', () => {
    expect(
      toOutboundUrl(
        'https://l.threads.com/?u=https%3A%2F%2Fexample.com%2Fpay%3Fa%3D1&e=AT0'
      )
    ).toBe('https://example.com/pay?a=1');
  });

  it('站內與非 http(s) 連結回傳 null', () => {
    expect(toOutboundUrl('/@someone/post/ABC')).toBeNull();
    expect(toOutboundUrl('https://www.threads.com/search?q=x')).toBeNull();
    expect(toOutboundUrl('mailto:a@example.com')).toBeNull();
    expect(
      toOutboundUrl('https://l.threads.com/?u=%2F%40someone&e=AT0')
    ).toBeNull();
  });

  it('一般外部連結原樣回傳', () => {
    expect(toOutboundUrl('https://line.me/ti/p/abc')).toBe(
      'https://line.me/ti/p/abc'
    );
  });
});

describe('pickSrcsetUrl', () => {
  // Threads 實際格式：逗號後沒有空白。
  const srcset = (...widths: number[]) =>
    widths.map((w) => `https://cdn.example/${w}.webp?a=1&b=2 ${w}w`).join(',');

  it('挑寬度不超過 1080 的最大張', () => {
    expect(pickSrcsetUrl(srcset(2160, 1080, 720, 640))).toBe(
      'https://cdn.example/1080.webp?a=1&b=2'
    );
    expect(pickSrcsetUrl(srcset(1500, 720, 640))).toBe(
      'https://cdn.example/720.webp?a=1&b=2'
    );
  });

  it('都超過 1080 時挑最小張；沒有 srcset 時回傳 undefined', () => {
    expect(pickSrcsetUrl(srcset(2160, 1440))).toBe(
      'https://cdn.example/1440.webp?a=1&b=2'
    );
    expect(pickSrcsetUrl('')).toBeUndefined();
  });
});
