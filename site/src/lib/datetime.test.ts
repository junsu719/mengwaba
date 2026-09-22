import { afterEach, describe, expect, it, vi } from 'vitest';
import { taipeiToday } from './datetime';

// 這裡直接鎖定系統時間(而非切換 process.env.TZ)來驗證邊界:taipeiToday() 內部用
// Intl.DateTimeFormat 明確指定 timeZone: 'Asia/Taipei',完全不理會執行環境本身的時區,
// 所以測試重點是「選一個 UTC 瞬間,驗證換算到 Asia/Taipei 在地日期是否正確跨日」,
// 不是驗證環境變數有沒有生效(那樣測不到這個函式真正要保證的行為)。
describe('taipeiToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('台北已跨日到隔天時,回傳新的一天(不受執行環境時區影響)', () => {
    // 2026-09-21T22:00:00Z = 台北時間 2026-09-22 06:00(UTC+8),但西半球多數時區此刻仍是 9/21
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T22:00:00Z'));
    expect(taipeiToday()).toBe('2026-09-22');
  });

  it('跨日前一刻仍回傳前一天', () => {
    // 2026-09-21T15:59:00Z = 台北時間 2026-09-21 23:59,尚未跨日
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T15:59:00Z'));
    expect(taipeiToday()).toBe('2026-09-21');
  });
});
