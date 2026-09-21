import { describe, expect, it } from 'vitest';
import { findUpcomingOccasions, type UpcomingOccasionEntry } from './deities';

function entry(deitySlug: string, solarDate: string): UpcomingOccasionEntry {
  return {
    deitySlug,
    deityTitle: deitySlug,
    occasionType: '聖誕',
    lunarLabel: '一月初一',
    solarDate,
    dateAdjusted: false,
    adjustNote: null,
  };
}

describe('findUpcomingOccasions', () => {
  it('只回傳今天以後(含今天)的紀錄,依日期排序,取前 limit 筆', () => {
    const entries = [entry('a', '2026-01-01'), entry('b', '2026-09-21'), entry('c', '2026-09-25'), entry('d', '2027-01-01')];
    const result = findUpcomingOccasions(entries, '2026-09-21', 2);
    expect(result.map((e) => e.deitySlug)).toEqual(['b', 'c']);
  });

  it('沒有符合的資料時回傳空陣列', () => {
    const entries = [entry('a', '2020-01-01')];
    expect(findUpcomingOccasions(entries, '2026-09-21', 5)).toEqual([]);
  });
});
