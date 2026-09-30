import { describe, expect, it } from 'vitest';
import type { CollectionPoint } from './data';
import { todayCardLines, todayCardHolidayFirst, hasUnknownWeekday, HOLIDAY_FIRST_LINE } from './today-card';
import { lunarLine, nextHolidayLine, pickTodayLines } from './today-card-client';
import { taipeiWeekday } from './datetime';
import { computeDayLunar } from './lunar-client';
import { nationalHolidayDates } from './calendar';
import { LUNAR_TABLE_RANGE } from './lunar-table.generated';

const base = { village: '某里', address: null, lat: null, lng: null, notes: null, source: 't', fetched_at: '2026-09-01' };
const P = (o: Partial<CollectionPoint>): CollectionPoint =>
  ({ point_id: 'T-1', city: '高雄市', district: '某區', point_name: '測試點', collection_type: '定點', schedule: [], ...base, ...o }) as CollectionPoint;

// 2026-09-30 是週三(3),2026-09-29 是週二(2)
const kaohsiung = P({ schedule: [{ weekday: [1, 3, 5], arrive: '19:00', depart: '19:10' }] });
const taichungStreet = P({ city: '臺中市', collection_type: '沿街收運', schedule: [{ weekday: [3], arrive: '18:00', depart: '18:10' }] });
const taoyuan = P({ city: '桃園市', collection_type: null, schedule: [{ weekday: [], arrive: '20:30', depart: null }] });
const newTaipei = P({
  city: '新北市',
  schedule: [{ weekday: [1, 2, 3, 4, 5, 6], arrive: '19:00', depart: '19:05' }],
  recycling_schedule: [{ weekday: [2, 4], arrive: '19:00', depart: '19:05' }],
  foodscraps_schedule: [{ weekday: [3, 5], arrive: '19:00', depart: '19:05' }],
});
const kaohsiung6 = P({ schedule: [{ weekday: [6], arrive: '19:00', depart: '19:10' }] });
const recyclingOnly = P({ schedule: [], recycling_schedule: [{ weekday: [3], arrive: '10:00', depart: '10:10' }] });

describe('todayCardLines', () => {
  it('高雄一般點:有收/沒收', () => {
    const yes = todayCardLines(kaohsiung, 3);
    expect(yes).toHaveLength(1);
    expect(yes[0]).toContain('19:00');
    expect(yes[0]).toContain('19:10');
    const no = todayCardLines(kaohsiung, 2);
    expect(no[0]).toMatch(/沒有排定|不會經過|休收/);
  });
  it('台中沿街收運用「經過」', () => {
    expect(todayCardLines(taichungStreet, 3)[0]).toContain('經過');
  });
  it('桃園星期未知:不說有收或沒收,只列到站時間,任何星期皆同', () => {
    for (let w = 1; w <= 7; w++) {
      const lines = todayCardLines(taoyuan, w);
      expect(lines[0]).toBe('本站尚未取得收運星期。到站時間約 20:30,完整班表請以官方系統為準');
      expect(lines.join('')).not.toMatch(/今天資源回收|今天廚餘|正常收運|會來|會到|沒有排定|休收/);
      expect(lines).toHaveLength(1);
      expect(lines.join('')).not.toMatch(/下方時刻表|詳細說明如下/);
    }
    expect(hasUnknownWeekday(taoyuan)).toBe(true);
    expect(hasUnknownWeekday(kaohsiung)).toBe(false);
  });
  it('新北:廚餘/資源回收只在當天有班次時出現,只講時間,不提同一輛車', () => {
    const wed = todayCardLines(newTaipei, 3);
    expect(wed).toContain('今天廚餘:19:00〜19:05');
    expect(wed.join('')).not.toContain('今天資源回收');
    const tue = todayCardLines(newTaipei, 2);
    expect(tue).toContain('今天資源回收:19:00〜19:05');
    expect(tue.join('')).not.toContain('廚餘');
    expect(newTaipei.schedule && todayCardLines(newTaipei, 7).join('')).not.toMatch(/廚餘|資源回收:/);
    for (let w = 1; w <= 7; w++) expect(todayCardLines(newTaipei, w).join('')).not.toMatch(/同一輛|同一台/);
  });
  it('廚餘只出現在新北', () => {
    const notNewTaipei = { ...newTaipei, city: '高雄市' };
    expect(todayCardLines(notNewTaipei, 3).join('')).not.toContain('廚餘');
  });
  it('純資源回收點:不說今天沒有收運', () => {
    for (let w = 1; w <= 7; w++) expect(todayCardLines(recyclingOnly, w).join('')).not.toMatch(/沒有收運|沒有排定|休收/);
    expect(todayCardLines(recyclingOnly, 3)).toContain('今天資源回收:10:00〜10:10');
  });
  it('不出現 undefined/NaN/null', () => {
    for (const p of [kaohsiung, taichungStreet, taoyuan, newTaipei, recyclingOnly])
      for (let w = 1; w <= 7; w++) expect(todayCardLines(p, w).join('')).not.toMatch(/undefined|NaN|null/);
  });
});

describe('taipeiWeekday', () => {
  it('週一=1、週日=7,格式錯誤回傳 null', () => {
    expect(taipeiWeekday('2026-09-28')).toBe(1);
    expect(taipeiWeekday('2026-09-30')).toBe(3);
    expect(taipeiWeekday('2026-10-04')).toBe(7);
    expect(taipeiWeekday('garbage')).toBeNull();
    expect(taipeiWeekday('')).toBeNull();
  });
});

describe('nextHolidayLine', () => {
  const entries = [{ year: 2026, slug: 'a', title: '國慶日', start: '2026-10-09', end: '2026-10-11', days: 3 }];
  it('倒數/當天/進行中/無資料', () => {
    expect(nextHolidayLine(entries, '2026-09-30')).toBe('下一個連假:國慶日,還有 9 天');
    expect(nextHolidayLine(entries, '2026-10-09')).toBe('連假中:國慶日,今天開始,放到 10/11');
    expect(nextHolidayLine(entries, '2026-10-09')).toBe('連假中:國慶日,今天開始,放到 10/11');
    expect(nextHolidayLine(entries, '2026-10-10')).toBe('連假中:國慶日,放到 10/11');
    expect(nextHolidayLine(entries, '2026-10-11')).toBe('連假中:國慶日,今天是最後一天');
    expect(nextHolidayLine(entries, '2026-10-12')).toBeNull();
    expect(nextHolidayLine([], '2026-09-30')).toBeNull();
    expect(nextHolidayLine(null, '2026-09-30')).toBeNull();
    expect(nextHolidayLine([{ start: 1 }], '2026-09-30')).toBeNull();
  });
});

describe('lunarLine 對照表', () => {
  it('涵蓋範圍內每一天都與 lunar-javascript 完整計算逐字一致', () => {
    let d = new Date(Date.parse(LUNAR_TABLE_RANGE.start));
    const end = Date.parse(LUNAR_TABLE_RANGE.end);
    let n = 0;
    for (; d.getTime() <= end; d = new Date(d.getTime() + 86_400_000)) {
      const s = d.toISOString().slice(0, 10);
      const i = computeDayLunar(s);
      expect(lunarLine(s), s).toBe(`今天農曆:${i.lunarYearGanZhi}年${i.isLeapMonth ? '閏' : ''}${i.lunarMonthLabel}${i.lunarDayLabel}`);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });
  it('超出範圍或格式錯誤不渲染', () => {
    expect(lunarLine('2025-12-31')).toBeNull();
    expect(lunarLine('2029-01-01')).toBeNull();
    expect(lunarLine('bad')).toBeNull();
  });
});

describe('國定假日當天(第一行不得說正常收運)', () => {
  const holidays = nationalHolidayDates();
  const pick = (p: CollectionPoint, date: string, weekday: number) =>
    pickTodayLines(
      Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((w) => [String(w), todayCardLines(p, w)])),
      todayCardHolidayFirst(p) as never,
      holidays,
      date,
      weekday
    )!;

  it('行事曆資料:國定假日與補假日在清單內,一般週末/平日不在', () => {
    expect(holidays).toContain('2026-10-10'); // 國慶日(週六)
    expect(holidays).toContain('2026-01-01'); // 開國紀念日
    expect(holidays.length).toBeGreaterThan(20);
    expect(holidays).not.toContain('2026-09-30'); // 平日
    expect(holidays).not.toContain('2026-10-04'); // 一般週日,memo 為空
  });
  it('國定假日當天、依班表有收:第一行改為提醒句,不含「正常收運」', () => {
    // 2026-10-10 週六(6);高雄點週六有班
    const lines = pick(kaohsiung6, '2026-10-10', 6);
    expect(lines[0]).toBe(HOLIDAY_FIRST_LINE);
    expect(lines.join('')).not.toContain('正常收運');
  });
  it('國定假日當天、依班表本來就沒收:維持原文案', () => {
    // 2026-10-10 週六;kaohsiung 週六沒班(週一三五)
    const lines = pick(kaohsiung, '2026-10-10', 6);
    expect(lines[0]).toBe(todayCardLines(kaohsiung, 6)[0]);
    expect(lines[0]).not.toContain('國定假日');
  });
  it('平日(非假日):即使該星期有班也維持原文案', () => {
    expect(pick(kaohsiung6, '2026-10-03', 6)[0]).toBe(todayCardLines(kaohsiung6, 6)[0]);
  });
  it('補假日當天有班表:同樣改為提醒句(2026-10-26 週一為補假,memo=補假)', () => {
    expect(holidays).toContain('2026-10-26');
    const p = P({ schedule: [{ weekday: [1], arrive: '19:00', depart: '19:10' }] });
    expect(pick(p, '2026-10-26', 1)[0]).toBe(HOLIDAY_FIRST_LINE);
  });
  it('補假日當天沒班表:維持原文案', () => {
    const p = P({ schedule: [{ weekday: [2], arrive: '19:00', depart: '19:10' }] });
    expect(pick(p, '2026-10-26', 1)[0]).toBe(todayCardLines(p, 1)[0]);
  });
  it('純回收點與桃園星期未知的點:規則照舊,不套用提醒句', () => {
    expect(todayCardHolidayFirst(recyclingOnly)).toEqual({});
    expect(todayCardHolidayFirst(taoyuan)).toEqual({});
    expect(pick(taoyuan, '2026-10-10', 6)[0]).toBe(todayCardLines(taoyuan, 6)[0]);
    expect(pick(recyclingOnly, '2026-10-10', 6)[0]).toBe(todayCardLines(recyclingOnly, 6)[0]);
  });
});
