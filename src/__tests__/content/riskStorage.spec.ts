import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '@/constants/riskRules';
import { partitionStored } from '@/content/riskStorage';
import type { StoredPost } from '@/content/riskStorage';

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
