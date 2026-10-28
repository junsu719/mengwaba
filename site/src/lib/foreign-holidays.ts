// 外國節日 × 台灣連假比對。資料來自 data/normalized/foreign-holidays/*.json
// (pipeline/parse_foreign_holidays.py 的輸出),比照 calendar.ts 用 import.meta.glob 在 build 時內嵌。
// 頁面上每一句話都由這裡的函式從該年實際資料算出,不寫死任何年份的結論;
// 只陳述「當地國定假日」這個事實,不推測人潮、擁擠、店家休息。

import { longWeekendTitle, type CalendarYearData, type LongWeekend } from './calendar';

export interface ForeignHoliday {
  d: string;
  name: string;
}

export type CountryCode = 'jp' | 'sg';

export interface Sgdataset {
  datasetId: string;
  name: string;
  managedBy: string;
  lastUpdatedAt: string;
}

export interface JpClosureRule {
  startMD: string;
  endMD: string;
  lawName: string;
  lawNumber: string;
  article: string;
  sourceUrl: string;
}

export interface ForeignData {
  jp: ForeignHoliday[];
  sg: ForeignHoliday[];
  sgDatasets: Record<string, Sgdataset>;
  jpClosure: JpClosureRule;
}

const modules = import.meta.glob<unknown>('../../../data/normalized/foreign-holidays/*.json', {
  eager: true,
  import: 'default',
});

function pick<T>(file: string): T {
  const entry = Object.entries(modules).find(([p]) => p.endsWith(`/${file}`));
  if (!entry) throw new Error(`找不到外國節日資料 ${file}`);
  return entry[1] as T;
}

let _cache: ForeignData | null = null;
export function loadForeignData(): ForeignData {
  if (_cache) return _cache;
  const jp = pick<{ holidays: ForeignHoliday[] }>('jp.json');
  const sg = pick<{ holidays: ForeignHoliday[]; datasets: Record<string, Sgdataset> }>('sg.json');
  _cache = {
    jp: jp.holidays,
    sg: sg.holidays,
    sgDatasets: sg.datasets,
    jpClosure: pick<JpClosureRule>('jp-gov-office-closure.json'),
  };
  return _cache;
}

export const COUNTRY_LABEL: Record<CountryCode, string> = { jp: '日本', sg: '新加坡' };

// 新加坡資料集假日名稱為英文;下列為中文對照(僅影響顯示)。遇到沒收錄的名稱,
// sgDisplayName 會原樣顯示英文,並由測試擋下(新增年度資料時必須補對照)。
const SG_ZH: Record<string, string> = {
  'New Year’s Day': '元旦',
  'Chinese New Year': '農曆新年',
  'Hari Raya Puasa': '開齋節',
  'Good Friday': '耶穌受難日',
  'Labour Day': '勞動節',
  'Hari Raya Haji': '哈芝節',
  'Vesak Day': '衛塞節',
  'National Day': '新加坡國慶日',
  Deepavali: '屠妖節',
  'Christmas Day': '聖誕節',
};

export function sgBaseName(name: string): string {
  return name.replace(/ \(Observed\)$/, '');
}

export function sgDisplayName(name: string): string {
  const zh = SG_ZH[sgBaseName(name)];
  if (!zh) return name;
  return name.endsWith('(Observed)') ? `${zh}補假(${name})` : `${zh}(${name})`;
}

export function sgNameIsMapped(name: string): boolean {
  return sgBaseName(name) in SG_ZH;
}

export function holidayDisplayName(country: CountryCode, name: string): string {
  return country === 'sg' ? sgDisplayName(name) : name;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayOf(d: string): string {
  return WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
}

/** 2026-05-03 → 5/3(日) */
export function formatMD(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}(${weekdayOf(d)})`;
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`).getTime();
  while (cur.getTime() <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function holidaysOnDate(list: ForeignHoliday[], d: string): ForeignHoliday[] {
  return list.filter((h) => h.d === d);
}

export function holidaysInYear(list: ForeignHoliday[], year: number): ForeignHoliday[] {
  return list.filter((h) => h.d.startsWith(`${year}-`));
}

/** 該日是否落在日本行政機關休日的 12/29–1/3 區間,且當天不是日本國民の祝日(法條第三款「前號に掲げる日を除く」)。 */
export function isJpGovClosureDate(d: string, jp: ForeignHoliday[], rule: Pick<JpClosureRule, 'startMD' | 'endMD'>): boolean {
  const md = d.slice(5);
  const inWindow = md >= rule.startMD || md <= rule.endMD; // 跨年區間:12-29 之後或 01-03 之前
  return inWindow && holidaysOnDate(jp, d).length === 0;
}

export interface DayRow {
  d: string;
  twLabel: string;
  jp: ForeignHoliday[];
  sg: ForeignHoliday[];
  jpClosure: boolean;
}

export interface LongWeekendComparison {
  lw: LongWeekend;
  title: string;
  rows: DayRow[];
  jpDays: number;
  sgDays: number;
  jpClosureDays: number;
}

export interface MismatchRow {
  d: string;
  name: string;
  /** 該日為週六/週日卻是台灣上班日(補班日) */
  twMakeupDay: boolean;
}

export interface YearComparison {
  year: number;
  longWeekends: LongWeekendComparison[];
  jpNationalCount: number;
  sgNationalCount: number;
  jpWorkdayHolidays: MismatchRow[];
  sgWorkdayHolidays: MismatchRow[];
  jpClosureWorkdays: string[];
  jpClosureDates: string[];
}

function twLabelOf(day: { is_holiday: boolean; memo: string; weekday: string } | undefined): string {
  if (!day) return '—';
  if (!day.is_holiday) return day.weekday === '六' || day.weekday === '日' ? '補班' : '上班';
  return day.memo || '週末';
}

export function compareYear(tw: CalendarYearData, data: Pick<ForeignData, 'jp' | 'sg' | 'jpClosure'>): YearComparison {
  const dayMap = new Map(tw.days.map((x) => [x.d, x]));
  const closure = (d: string) => isJpGovClosureDate(d, data.jp, data.jpClosure);

  const longWeekends = tw.long_weekends.map((lw): LongWeekendComparison => {
    const rows = eachDate(lw.start, lw.end).map((d) => ({
      d,
      twLabel: twLabelOf(dayMap.get(d)),
      jp: holidaysOnDate(data.jp, d),
      sg: holidaysOnDate(data.sg, d),
      jpClosure: closure(d),
    }));
    return {
      lw,
      title: longWeekendTitle(lw),
      rows,
      jpDays: rows.filter((r) => r.jp.length > 0).length,
      sgDays: rows.filter((r) => r.sg.length > 0).length,
      jpClosureDays: rows.filter((r) => r.jpClosure).length,
    };
  });

  const workdayHolidays = (list: ForeignHoliday[]): MismatchRow[] =>
    holidaysInYear(list, tw.year)
      .filter((h) => dayMap.get(h.d) && !dayMap.get(h.d)!.is_holiday)
      .map((h) => ({ d: h.d, name: h.name, twMakeupDay: ['六', '日'].includes(dayMap.get(h.d)!.weekday) }));

  const jpClosureDates = tw.days.map((x) => x.d).filter(closure);

  return {
    year: tw.year,
    longWeekends,
    jpNationalCount: new Set(holidaysInYear(data.jp, tw.year).map((h) => h.d)).size,
    sgNationalCount: new Set(holidaysInYear(data.sg, tw.year).map((h) => h.d)).size,
    jpWorkdayHolidays: workdayHolidays(data.jp),
    sgWorkdayHolidays: workdayHolidays(data.sg),
    jpClosureDates,
    jpClosureWorkdays: jpClosureDates.filter((d) => dayMap.get(d) && !dayMap.get(d)!.is_holiday),
  };
}

// ---- 句子:全部由 YearComparison 現算 ----

export function summarySentence(c: YearComparison): string {
  const n = c.longWeekends.length;
  const jp = c.longWeekends.filter((x) => x.jpDays > 0).length;
  const sg = c.longWeekends.filter((x) => x.sgDays > 0).length;
  return `${c.year} 年台灣有 ${n} 個 3 天以上連假;其中 ${jp} 個連假期間日本有當地國定假日,${sg} 個連假期間新加坡有當地國定假日。`;
}

export function longWeekendSentence(x: LongWeekendComparison): string {
  const part = (label: string, days: number) =>
    days > 0 ? `${label}有 ${days} 天是當地國定假日` : `${label}沒有當地國定假日`;
  return `${x.lw.start} 至 ${x.lw.end}(${x.lw.days} 天):${part('日本', x.jpDays)};${part('新加坡', x.sgDays)}。`;
}

export function workdayHolidaySentence(country: CountryCode, c: YearComparison): string {
  const total = country === 'jp' ? c.jpNationalCount : c.sgNationalCount;
  const rows = country === 'jp' ? c.jpWorkdayHolidays : c.sgWorkdayHolidays;
  const makeup = rows.filter((r) => r.twMakeupDay).length;
  const base = `${c.year} 年${COUNTRY_LABEL[country]}當地國定假日共 ${total} 天,其中 ${rows.length} 天台灣當天要上班`;
  return makeup > 0 ? `${base}(含 ${makeup} 天為台灣週末補班日)。` : `${base}。`;
}

export function jpClosureSentence(c: YearComparison): string {
  return `${c.year} 年落在 12/29–12/31 與 1/1–1/3 區間、且不是日本國民の祝日的日期共 ${c.jpClosureDates.length} 天,其中 ${c.jpClosureWorkdays.length} 天台灣當天要上班。`;
}

/** 頁面 description:同樣現算 */
export function pageDescription(c: YearComparison): string {
  const jp = c.longWeekends.filter((x) => x.jpDays > 0).length;
  const sg = c.longWeekends.filter((x) => x.sgDays > 0).length;
  return `${c.year} 年台灣 ${c.longWeekends.length} 個連假逐日對照日本、新加坡當地國定假日(日本 ${jp} 個、新加坡 ${sg} 個連假期間有),並列出外國放假、台灣要上班的日子。`;
}
