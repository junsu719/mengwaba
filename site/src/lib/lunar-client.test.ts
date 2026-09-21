import { describe, expect, it } from 'vitest';
import { computeDayLunar, solarToLunar, lunarToSolarRange } from './lunar-client';

// 這裡不重複驗證 lunar-javascript 底層演算法本身(已於 DECISIONS.md 2026-09-21 條目完成
// 25 天市售黃曆比對),只驗證本站包裝層(繁體轉換、欄位組裝、閏月/不存在日期處理)接得對。

describe('computeDayLunar', () => {
  it('2026-09-21 的宜忌/沖煞/煞方與 DECISIONS.md 記錄的比對基準一致(已轉繁體)', () => {
    const info = computeDayLunar('2026-09-21');
    expect(info.lunarYearGanZhi).toBe('丙午');
    expect(info.lunarMonthLabel).toBe('八月');
    expect(info.lunarDayLabel).toBe('十一');
    expect(info.isLeapMonth).toBe(false);
    expect(info.dayGanZhi).toBe('戊戌');
    expect(info.chongGanZhi).toBe('壬辰');
    expect(info.chongZodiac).toBe('龍'); // 簡體「龙」已轉繁體
    expect(info.shaDirection).toBe('北');
    expect(info.yi.slice(0, 3)).toEqual(['嫁娶', '納採', '祭祀']); // 纳采/祭祀已轉繁體
    expect(info.ji).toEqual(['造廟', '行喪', '安葬', '伐木', '作灶', '造船']);
    expect(info.jiShen).toEqual(['母倉', '守日', '吉期', '續世']);
    expect(info.xiongSha).toEqual(['月害', '血忌', '天牢']);
  });

  it('節氣當天(2026-09-23 秋分)回報 jieQiToday,非節氣當天回報 prev/next', () => {
    const onTerm = computeDayLunar('2026-09-23');
    expect(onTerm.jieQiToday).toBe('秋分');

    const offTerm = computeDayLunar('2026-09-21');
    expect(offTerm.jieQiToday).toBeNull();
    expect(offTerm.prevJie.name).toBe('白露');
    expect(offTerm.nextJie.name).toBe('寒露');
  });
});

describe('solarToLunar', () => {
  it('國曆轉農曆,非閏月', () => {
    const r = solarToLunar('2026-09-21');
    expect(r.month).toBe(8);
    expect(r.day).toBe(11);
    expect(r.isLeapMonth).toBe(false);
  });
});

describe('lunarToSolarRange', () => {
  it('平月月日在每個年度都存在', () => {
    const results = lunarToSolarRange(8, 15, false, 2026, 2028);
    expect(results).toHaveLength(3);
    expect(results.every((r) => !r.notExist)).toBe(true);
    expect(results[0].solarDate).toBe('2026-09-25');
  });

  it('閏月月日只在真的有該閏月的年度存在,其餘年度 notExist=true 且 solarDate 為 null', () => {
    // 2025 年是農曆乙巳年閏六月(見 data/processed/lunar/README.md 驗證結果)
    const results = lunarToSolarRange(6, 15, true, 2024, 2026);
    const byYear = Object.fromEntries(results.map((r) => [r.lunarYear, r]));
    expect(byYear[2025].notExist).toBe(false);
    expect(byYear[2025].solarDate).toBe('2025-08-08');
    expect(byYear[2024].notExist).toBe(true);
    expect(byYear[2024].solarDate).toBeNull();
    expect(byYear[2026].notExist).toBe(true);
  });
});
