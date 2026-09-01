import { describe, expect, it } from 'vitest';
import {
  headlineNames,
  longWeekendTitle,
  longWeekendSlug,
  notableFestivalChecks,
  buildIcsFeed,
  computeLeavePlans,
  leavePlanTitle,
  type CalendarYearData,
  type LongWeekend,
  type CalendarDay,
} from './calendar';

function day(d: string, weekday: string, is_holiday: boolean, memo = ''): CalendarDay {
  return { d, weekday, is_holiday, memo };
}

// 比照 data.test.ts 慣例:寫死小型 fixture,不讀 data/normalized/calendar/*.json
// (該資料每年手動更新一次,讀活資料會在換年份資料時產生跟程式碼改動無關的假失敗)。

describe('headlineNames / longWeekendTitle', () => {
  it('排除補假、小年夜等非節日標記,節日去重', () => {
    const names = ['小年夜', '農曆除夕', '春節', '春節', '春節', '補假'];
    expect(headlineNames(names)).toEqual(['春節']);
    expect(longWeekendTitle({ start: '2027-02-04', end: '2027-02-10', days: 7, names })).toBe('春節連假');
  });

  it('兩個節日同時出現時依原順序合併標題', () => {
    const names = ['兒童節', '清明節', '補假'];
    expect(headlineNames(names)).toEqual(['兒童節', '清明節']);
    expect(longWeekendTitle({ start: '2027-04-03', end: '2027-04-06', days: 4, names })).toBe('兒童節・清明節連假');
  });

  it('教師節全名縮寫為短標籤', () => {
    expect(headlineNames(['中秋節', '孔子誕辰紀念日/教師節'])).toEqual(['中秋節', '教師節']);
  });

  it('沒有可辨識節日名稱時回退為日期敘述', () => {
    const w: LongWeekend = { start: '2026-01-01', end: '2026-01-03', days: 3, names: [] };
    expect(longWeekendTitle(w)).toBe('連假(2026-01-01 起 3 天)');
  });
});

describe('longWeekendSlug', () => {
  it('取起始日 MMDD', () => {
    expect(longWeekendSlug({ start: '2027-02-04', end: '2027-02-10', days: 7, names: [] })).toBe('0204');
    expect(longWeekendSlug({ start: '2027-12-24', end: '2027-12-26', days: 3, names: [] })).toBe('1224');
  });
});

function calendarFixture(overrides: Partial<CalendarYearData>): CalendarYearData {
  return {
    year: 2027,
    total_days: 365,
    holiday_days: 121,
    long_weekends: [],
    days: [],
    ...overrides,
  };
}

describe('notableFestivalChecks', () => {
  it('端午/中秋/教師節皆孤立時,三者皆回報未形成連假', () => {
    const data = calendarFixture({
      long_weekends: [{ start: '2027-01-01', end: '2027-01-03', days: 3, names: ['開國紀念日'] }],
      days: [
        { d: '2027-06-09', weekday: '三', is_holiday: true, memo: '端午節' },
        { d: '2027-09-15', weekday: '三', is_holiday: true, memo: '中秋節' },
        { d: '2027-09-28', weekday: '二', is_holiday: true, memo: '孔子誕辰紀念日/教師節' },
      ],
    });
    const result = notableFestivalChecks(data);
    expect(result).toEqual([
      { name: '端午節', date: '2027-06-09', formsLongWeekend: false },
      { name: '中秋節', date: '2027-09-15', formsLongWeekend: false },
      { name: '教師節', date: '2027-09-28', formsLongWeekend: false },
    ]);
  });

  it('落在連假區間內時回報有形成連假(2026 中秋+教師節案例)', () => {
    const data = calendarFixture({
      year: 2026,
      long_weekends: [
        { start: '2026-09-25', end: '2026-09-28', days: 4, names: ['中秋節', '孔子誕辰紀念日/教師節'] },
      ],
      days: [
        { d: '2026-09-26', weekday: '六', is_holiday: true, memo: '' },
        { d: '2026-09-27', weekday: '日', is_holiday: true, memo: '中秋節' },
        { d: '2026-09-28', weekday: '一', is_holiday: true, memo: '孔子誕辰紀念日/教師節' },
      ],
    });
    const result = notableFestivalChecks(data);
    expect(result.find((r) => r.name === '中秋節')).toEqual({ name: '中秋節', date: '2026-09-27', formsLongWeekend: true });
    expect(result.find((r) => r.name === '教師節')).toEqual({ name: '教師節', date: '2026-09-28', formsLongWeekend: true });
  });

  it('查無該節日時回傳 date: null、formsLongWeekend: false', () => {
    const data = calendarFixture({ days: [] });
    expect(notableFestivalChecks(data)).toEqual([
      { name: '端午節', date: null, formsLongWeekend: false },
      { name: '中秋節', date: null, formsLongWeekend: false },
      { name: '教師節', date: null, formsLongWeekend: false },
    ]);
  });
});

describe('buildIcsFeed', () => {
  it('只收錄備註非空的放假日,週末空白列不輸出事件', () => {
    const data = calendarFixture({
      days: [
        { d: '2027-01-01', weekday: '五', is_holiday: true, memo: '開國紀念日' },
        { d: '2027-01-02', weekday: '六', is_holiday: true, memo: '' },
        { d: '2027-01-04', weekday: '一', is_holiday: false, memo: '' },
      ],
    });
    const ics = buildIcsFeed(data, 'https://mengwaba.com', new Date('2027-01-01T00:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:開國紀念日');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270101');
    expect(ics).toContain('DTEND;VALUE=DATE:20270102');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect(ics.includes('\r\n')).toBe(true);
  });
});

describe('computeLeavePlans', () => {
  it('端午節案例:週末+2工作日缺口+週三假日+2工作日缺口+週末,合併成 9 天、請 4 天假', () => {
    const data = calendarFixture({
      days: [
        day('2027-06-05', '六', true),
        day('2027-06-06', '日', true),
        day('2027-06-07', '一', false),
        day('2027-06-08', '二', false),
        day('2027-06-09', '三', true, '端午節'),
        day('2027-06-10', '四', false),
        day('2027-06-11', '五', false),
        day('2027-06-12', '六', true),
        day('2027-06-13', '日', true),
      ],
    });
    const plans = computeLeavePlans(data);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual({
      start: '2027-06-05',
      end: '2027-06-13',
      totalDays: 9,
      leaveDates: ['2027-06-07', '2027-06-08', '2027-06-10', '2027-06-11'],
      anchorNames: ['端午節'],
    });
    expect(leavePlanTitle(plans[0])).toBe('端午節拼假攻略');
  });

  it('缺口超過 3 個工作日時不提案', () => {
    const data = calendarFixture({
      days: [
        day('2027-06-05', '六', true),
        day('2027-06-06', '日', true),
        day('2027-06-07', '一', false),
        day('2027-06-08', '二', false),
        day('2027-06-09', '三', false),
        day('2027-06-10', '四', false),
        day('2027-06-11', '五', true, '端午節'),
      ],
    });
    expect(computeLeavePlans(data)).toEqual([]);
  });

  it('兩個純週末之間即使缺口 <=3 天也不提案(未錨定在真正國定假日上)', () => {
    const data = calendarFixture({
      days: [
        day('2027-06-05', '六', true),
        day('2027-06-06', '日', true),
        day('2027-06-07', '一', false),
        day('2027-06-08', '二', false),
        day('2027-06-09', '三', false),
        day('2027-06-12', '六', true),
        day('2027-06-13', '日', true),
      ],
    });
    expect(computeLeavePlans(data)).toEqual([]);
  });

  it('已經是 3 天以上連假、前後缺口皆過大時不重複提案', () => {
    const data = calendarFixture({
      days: [
        day('2027-06-01', '二', false),
        day('2027-06-02', '三', false),
        day('2027-06-03', '四', false),
        day('2027-06-04', '五', true, '端午節'),
        day('2027-06-05', '六', true),
        day('2027-06-06', '日', true),
        day('2027-06-07', '一', false),
      ],
    });
    expect(computeLeavePlans(data)).toEqual([]);
  });
});
