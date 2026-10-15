import { describe, expect, it, vi } from 'vitest';
import {
  getAccountRisk,
  getCheckedPosts,
  ignoreAccount,
  markChecked,
  recordPostRisk,
  restoreIgnored,
} from '@/content/accountRisks';
import type { RiskLevel, RiskResult } from '@/types/risk';

vi.mock('@/utils/riskStorage', () => ({
  saveIgnoredAccounts: vi.fn(() => Promise.resolve()),
}));

const result = (postId: string, level: RiskLevel): RiskResult => ({
  subjectType: 'post',
  subjectKey: `threads:${postId}`,
  level,
  signals: [],
  analyzedAt: 0,
  expiresAt: 1,
  engineVersion: 'test',
});
const record = (handle: string, postId: string, level: RiskLevel) =>
  recordPostRisk(
    handle,
    `https://www.threads.com/@${handle}/post/${postId}`,
    result(postId, level),
    'post'
  );

// 模組狀態跨測試共用，每個測試用不同帳號。
describe('accountRisks 帳號標示與忽略', () => {
  it('等級取該帳號貼文的最高等級', () => {
    expect(record('a', 'A1', 'notice')).toBe(true);
    expect(record('a', 'A2', 'caution')).toBe(false);
    expect(getAccountRisk('a')?.level).toBe('caution');
  });

  it('忽略帳號後移除標示，之後的可疑貼文也不再標示', () => {
    record('b', 'B1', 'high');
    ignoreAccount('b');
    expect(getAccountRisk('b')).toBeUndefined();
    expect(record('b', 'B2', 'high')).toBe(false);
    expect(getAccountRisk('b')).toBeUndefined();
  });

  it('還原的忽略清單生效', () => {
    restoreIgnored(['c']);
    expect(record('c', 'C1', 'high')).toBe(false);
    expect(getAccountRisk('c')).toBeUndefined();
  });
});

describe('accountRisks 已檢查的貼文與留言', () => {
  const url = (handle: string, postId: string) =>
    `https://www.threads.com/@${handle}/post/${postId}`;

  it('分開記貼文與留言，同一則只算一次', () => {
    markChecked('d', url('d', 'D1'), 'post');
    markChecked('d', url('d', 'D1'), 'post');
    markChecked('d', url('d', 'D2'), 'reply');
    expect([...(getCheckedPosts('d')?.values() ?? [])]).toEqual([
      'post',
      'reply',
    ]);
  });

  it('判定結果不影響已檢查紀錄（快取還原的不算看過）', () => {
    record('e', 'E1', 'high');
    expect(getCheckedPosts('e')).toBeUndefined();
    expect(getAccountRisk('e')?.level).toBe('high');
  });

  it('忽略的帳號不記錄，忽略時清掉已檢查紀錄', () => {
    markChecked('f', url('f', 'F1'), 'post');
    ignoreAccount('f');
    expect(getCheckedPosts('f')).toBeUndefined();
    markChecked('f', url('f', 'F2'), 'post');
    expect(getCheckedPosts('f')).toBeUndefined();
  });
});
