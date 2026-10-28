import { describe, expect, it } from 'vitest';
import {
  compareYear,
  eachDate,
  formatMD,
  holidaysInYear,
  isJpGovClosureDate,
  jpClosureSentence,
  loadForeignData,
  longWeekendSentence,
  sgDisplayName,
  sgNameIsMapped,
  summarySentence,
  workdayHolidaySentence,
  type ForeignHoliday,
} from './foreign-holidays';
import { loadCalendarYear, CALENDAR_YEARS } from './calendar';

// ---- 鎖定實際資料筆數(2026-10-28 抓取;換年度/重抓資料時有意識地更新) ----
describe('外國節日實際資料筆數(鎖定)', () => {
  const data = loadForeignData();
  it('日本 2026 年 18 筆、2027 年 17 筆', () => {
    expect(holidaysInYear(data.jp, 2026)).toHaveLength(18);
    expect(holidaysInYear(data.jp, 2027)).toHaveLength(17);
  });
  it('新加坡 2026 年 14 筆、2027 年 12 筆', () => {
    expect(holidaysInYear(data.sg, 2026)).toHaveLength(14);
    expect(holidaysInYear(data.sg, 2027)).toHaveLength(12);
  });
  it('只含 2026、2027 兩年', () => {
    for (const h of [...data.jp, ...data.sg]) expect(['2026', '2027']).toContain(h.d.slice(0, 4));
  });
  it('新加坡所有假日名稱都有中文對照', () => {
    for (const h of data.sg) expect(sgNameIsMapped(h.name), h.name).toBe(true);
  });
  it('每個台灣日曆年度都能算出比對,且日期涵蓋全年', () => {
    for (const y of CALENDAR_YEARS) {
      const c = compareYear(loadCalendarYear(y), data);
      expect(c.longWeekends).toHaveLength(loadCalendarYear(y).long_weekends.length);
    }
  });
});

// ---- 比對邏輯:小型 fixture,不依賴活資料 ----
const jp: ForeignHoliday[] = [
  { d: '2030-01-01', name: '元日' },
  { d: '2030-01-14', name: '成人の日' },
  { d: '2030-02-11', name: '建国記念の日' },
];
const sg: ForeignHoliday[] = [
  { d: '2030-01-01', name: 'New Year’s Day' },
  { d: '2030-02-11', name: 'Chinese New Year' },
  { d: '2030-02-12', name: 'Chinese New Year (Observed)' },
];
const rule = { startMD: '12-29', endMD: '01-03', lawName: '', lawNumber: '', article: '', sourceUrl: '' };

function mkYear(): Parameters<typeof compareYear>[0] {
  const days = eachDate('2030-01-01', '2030-02-28').map((d) => {
    const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${d}T00:00:00Z`).getUTCDay()];
    const weekend = wd === '六' || wd === '日';
    return { d, weekday: wd, is_holiday: weekend || d === '2030-01-01', memo: d === '2030-01-01' ? '開國紀念日' : '' };
  });
  // 2030-02-16(六)設為補班日
  const mk = days.find((x) => x.d === '2030-02-16')!;
  mk.is_holiday = false;
  return {
    year: 2030,
    total_days: days.length,
    holiday_days: 0,
    long_weekends: [{ start: '2030-02-09', end: '2030-02-11', days: 3, names: ['春節'] }],
    days,
  };
}

describe('compareYear', () => {
  const c = compareYear(mkYear(), { jp, sg, jpClosure: rule });
  it('連假逐日對照同一天的日本/新加坡假日', () => {
    const rows = c.longWeekends[0].rows;
    expect(rows.map((r) => r.d)).toEqual(['2030-02-09', '2030-02-10', '2030-02-11']);
    expect(rows[2].jp[0].name).toBe('建国記念の日');
    expect(rows[2].sg[0].name).toBe('Chinese New Year');
    expect(c.longWeekends[0].jpDays).toBe(1);
    expect(c.longWeekends[0].sgDays).toBe(1);
  });
  it('外國放假、台灣上班:排除台灣已放假的日子,標出補班日', () => {
    // 1/1 台灣也放假 → 排除;1/14、2/11 為台灣週一上班日 → 列入
    expect(c.jpWorkdayHolidays.map((r) => r.d)).toEqual(['2030-01-14', '2030-02-11']);
    expect(c.sgWorkdayHolidays.map((r) => r.d)).toEqual(['2030-02-11', '2030-02-12']);
    expect(c.sgWorkdayHolidays.every((r) => !r.twMakeupDay)).toBe(true);
  });
  it('補班的週末日若為外國假日,標 twMakeupDay', () => {
    const y = mkYear();
    const r = compareYear(y, { jp: [{ d: '2030-02-16', name: 'X' }], sg: [], jpClosure: rule });
    expect(r.jpWorkdayHolidays).toEqual([{ d: '2030-02-16', name: 'X', twMakeupDay: true }]);
  });
  it('句子隨資料改變(不寫死)', () => {
    expect(summarySentence(c)).toContain('2030 年');
    expect(summarySentence(c)).toContain('1 個連假期間日本有當地國定假日');
    const none = compareYear(mkYear(), { jp: [], sg: [], jpClosure: rule });
    expect(summarySentence(none)).toContain('0 個連假期間日本有當地國定假日');
    expect(longWeekendSentence(none.longWeekends[0])).toContain('日本沒有當地國定假日');
    expect(longWeekendSentence(c.longWeekends[0])).toContain('日本有 1 天是當地國定假日');
    expect(workdayHolidaySentence('sg', c)).toContain('其中 2 天台灣當天要上班');
  });
  it('句子不含人潮/擁擠/店家等推測字眼', () => {
    const all = [summarySentence(c), longWeekendSentence(c.longWeekends[0]), workdayHolidaySentence('jp', c), jpClosureSentence(c)].join('');
    for (const w of ['人潮', '擁擠', '店家', '商店', '休息', '壅塞', '熱門']) expect(all).not.toContain(w);
  });
});

describe('日本行政機關休日 12/29–1/3', () => {
  it('區間內且非祝日才算;1/1 是國民の祝日故排除', () => {
    const j = [{ d: '2030-01-01', name: '元日' }];
    expect(isJpGovClosureDate('2029-12-29', j, rule)).toBe(true);
    expect(isJpGovClosureDate('2029-12-28', j, rule)).toBe(false);
    expect(isJpGovClosureDate('2030-01-01', j, rule)).toBe(false);
    expect(isJpGovClosureDate('2030-01-03', j, rule)).toBe(true);
    expect(isJpGovClosureDate('2030-01-04', j, rule)).toBe(false);
  });
  it('實際資料規則檔指向 e-Gov 官方網址', () => {
    expect(loadForeignData().jpClosure.sourceUrl).toBe('https://laws.e-gov.go.jp/law/363AC0000000091');
  });
});

describe('格式', () => {
  it('formatMD', () => expect(formatMD('2026-05-03')).toBe('5/3(日)'));
  it('sgDisplayName', () => {
    expect(sgDisplayName('Chinese New Year')).toBe('農曆新年(Chinese New Year)');
    expect(sgDisplayName('Chinese New Year (Observed)')).toBe('農曆新年補假(Chinese New Year (Observed))');
  });
});
