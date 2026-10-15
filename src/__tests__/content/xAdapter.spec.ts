import { describe, expect, it } from 'vitest';
import { isSupportedPath, toOutboundUrl, toPhotoUrl } from '@/content/xAdapter';

describe('xAdapter 外部連結', () => {
  it('內文連結直接用 href，站內連結不算', () => {
    expect(
      toOutboundUrl('https://go.nasa.gov/4i6Xa9I', 'go.nasa.gov/4i6Xa9I')
    ).toBe('https://go.nasa.gov/4i6Xa9I');
    expect(toOutboundUrl('/NASA', '@NASA')).toBeNull();
    expect(toOutboundUrl('/NASA/status/1/photo/1', '')).toBeNull();
    expect(toOutboundUrl('https://twitter.com/home', '')).toBeNull();
  });

  it('t.co 改用畫面上顯示的網址或卡片網域', () => {
    expect(toOutboundUrl('https://t.co/k8OaOoFXJe', '從 bbc.com')).toBe(
      'https://bbc.com/'
    );
    expect(toOutboundUrl('https://t.co/abc', 'From myship-711.shop')).toBe(
      'https://myship-711.shop/'
    );
    expect(toOutboundUrl('https://t.co/abc', 'https://example.com/pa…')).toBe(
      'https://example.com/pa'
    );
  });

  it('t.co 卡片標題等一般文字看不出目的地，不算', () => {
    expect(
      toOutboundUrl('https://t.co/abc', 'Imran Khan: Bollywood actor asked')
    ).toBeNull();
    expect(toOutboundUrl('https://t.co/abc', '')).toBeNull();
  });
});

describe('xAdapter 貼文照片', () => {
  it('貼文照片改用 jpg、name=medium', () => {
    expect(
      toPhotoUrl(
        'https://pbs.twimg.com/media/HUn48qSW8AEmiHh?format=webp&name=large'
      )
    ).toBe(
      'https://pbs.twimg.com/media/HUn48qSW8AEmiHh?format=jpg&name=medium'
    );
  });

  it('頭像與卡片縮圖不辨識', () => {
    expect(
      toPhotoUrl('https://pbs.twimg.com/profile_images/1/a_normal.jpg')
    ).toBeNull();
    expect(
      toPhotoUrl('https://pbs.twimg.com/card_img/1/a?format=webp&name=medium')
    ).toBeNull();
  });
});

describe('xAdapter 偵測頁面', () => {
  it('首頁、個人頁與單篇貼文頁', () => {
    ['/home', '/NASA', '/NASA/with_replies', '/NASA/status/123'].forEach(
      (path) => expect(isSupportedPath(path)).toBe(true)
    );
  });

  it('探索、通知、搜尋與帳號的其他頁面不處理', () => {
    [
      '/explore',
      '/notifications',
      '/search',
      '/i/bookmarks',
      '/NASA/followers',
    ].forEach((path) => expect(isSupportedPath(path)).toBe(false));
  });
});
