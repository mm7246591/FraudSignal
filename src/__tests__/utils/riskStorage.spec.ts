import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '@/engine/riskRules';
import {
  DEFAULT_SETTINGS,
  parseIgnored,
  parseSettings,
  partitionStored,
} from '@/utils/riskStorage';
import type { StoredPost } from '@/utils/riskStorage';

const NOW = 1_000_000;

const stored = (
  postId: string,
  {
    analyzedAt = NOW - 1,
    expiresAt = NOW + 1,
    engineVersion = ENGINE_VERSION,
  } = {}
): [string, StoredPost] => [
  `result:threads:${postId}`,
  {
    postId,
    authorHandle: 'someone',
    postUrl: `https://www.threads.com/@someone/post/${postId}`,
    result: {
      subjectType: 'post',
      subjectKey: `threads:${postId}`,
      level: 'notice',
      signals: [],
      analyzedAt,
      expiresAt,
      engineVersion,
    },
  },
];

describe('partitionStored 快取整理（規格 9）', () => {
  it('保留有效判定，刪除舊版本、過期與格式不對的', () => {
    const { posts, staleKeys } = partitionStored(
      Object.fromEntries([
        stored('OK'),
        stored('OLD', { engineVersion: '0' }),
        stored('EXPIRED', { expiresAt: NOW }),
        ['result:threads:BROKEN', { postId: 'BROKEN' }],
      ]),
      NOW
    );
    expect(posts.map((post) => post.postId)).toEqual(['OK']);
    expect(staleKeys.sort()).toEqual([
      'result:threads:BROKEN',
      'result:threads:EXPIRED',
      'result:threads:OLD',
    ]);
  });

  it('忽略清單等其他鍵不動', () => {
    const { staleKeys } = partitionStored(
      { ignoredAccounts: ['someone'], ...Object.fromEntries([stored('OK')]) },
      NOW
    );
    expect(staleKeys).toEqual([]);
  });

  it('超過 1000 筆時刪掉最舊的', () => {
    const entries = Array.from({ length: 1001 }, (_, i) =>
      stored(`P${i}`, { analyzedAt: i })
    );
    const { posts, staleKeys } = partitionStored(
      Object.fromEntries(entries),
      NOW
    );
    expect(posts).toHaveLength(1000);
    expect(staleKeys).toEqual(['result:threads:P0']);
  });
});

describe('parseSettings', () => {
  it('沒有設定時用預設值：開啟、顯示全部等級與已檢查的帳號', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      enabled: true,
      minLevel: 'notice',
      showChecked: true,
    });
  });

  it('合法的設定原樣讀回', () => {
    expect(
      parseSettings({ enabled: false, minLevel: 'high', showChecked: true })
    ).toEqual({ enabled: false, minLevel: 'high', showChecked: true });
  });

  it('逐欄檢查，不合法的欄位用預設值', () => {
    expect(parseSettings({ enabled: 'no', minLevel: 'unknown' })).toEqual(
      DEFAULT_SETTINGS
    );
    // 物件繼承的屬性不算等級。
    expect(parseSettings({ minLevel: 'toString' }).minLevel).toBe('notice');
    expect(
      parseSettings({ enabled: false, minLevel: 3, showChecked: 'yes' })
    ).toEqual({ enabled: false, minLevel: 'notice', showChecked: true });
  });
});

describe('parseIgnored 忽略清單', () => {
  it('讀取「平台:帳號」，舊版只有帳號名稱的當成 Threads', () => {
    expect(parseIgnored(['x:NASA', 'threads:someone', 'legacy'])).toEqual([
      { platform: 'x', handle: 'NASA' },
      { platform: 'threads', handle: 'someone' },
      { platform: 'threads', handle: 'legacy' },
    ]);
  });

  it('不認得的平台與格式不對的項目略過', () => {
    expect(parseIgnored(['ig:someone', 'x:', 1, null])).toEqual([]);
    expect(parseIgnored('x:NASA')).toEqual([]);
  });
});
