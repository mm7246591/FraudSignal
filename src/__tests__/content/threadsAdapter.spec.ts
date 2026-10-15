import { describe, expect, it } from 'vitest';
import { toOutboundUrl } from '@/content/threadsAdapter';

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
