// 讀取 data/normalized/calendar/*.json(pipeline/parse_calendar.py 的輸出,見 DECISIONS.md
// 2026-09-01 條目)。這個工具全靜態、不碰 D1(Phase 0 拍板,25 頁以內),故比照
// data-static.ts 的做法用 import.meta.glob 在 build 時把資料內嵌進模組,不在執行期讀檔案。

export interface CalendarDay {
  d: string;
  weekday: string;
  is_holiday: boolean;
  memo: string;
}

export interface LongWeekend {
  start: string;
  end: string;
  days: number;
  names: string[];
}

export interface CalendarYearData {
  year: number;
  total_days: number;
  holiday_days: number;
  long_weekends: LongWeekend[];
  days: CalendarDay[];
}

const calendarModules = import.meta.glob<{ default: CalendarYearData }>(
  '../../../data/normalized/calendar/*.json',
  { eager: true }
);

export const CALENDAR_YEARS = [2026, 2027] as const;

const _cache = new Map<number, CalendarYearData>();

export function loadCalendarYear(year: number): CalendarYearData {
  if (_cache.has(year)) return _cache.get(year)!;
  const entry = Object.entries(calendarModules).find(([modulePath]) => modulePath.endsWith(`/${year}.json`));
  if (!entry) throw new Error(`找不到 ${year} 年行事曆資料`);
  const data = entry[1].default;
  _cache.set(year, data);
  return data;
}

// 判斷「連假標題該掛哪個節日名稱」用的白名單與順序,刻意排除「小年夜」「補假」這類非節日本身
// 的標記(補假不是節日,是把某天挪來放假的手段;小年夜是除夕前一天的俗稱,非官方假日名稱)。
const MAJOR_HOLIDAY_ORDER = [
  '開國紀念日',
  '春節',
  '和平紀念日',
  '兒童節',
  '清明節',
  '勞動節',
  '端午節',
  '中秋節',
  '孔子誕辰紀念日/教師節',
  '國慶日',
  '臺灣光復暨金門古寧頭大捷紀念日',
  '行憲紀念日',
];

// 官方全名太長不適合當標題/UID 顯示,僅影響呈現文字,不影響資料本身。
const SHORT_LABEL: Record<string, string> = {
  '孔子誕辰紀念日/教師節': '教師節',
};

export function shortLabel(name: string): string {
  return SHORT_LABEL[name] ?? name;
}

/** 從連假涵蓋的備註字串中,依 MAJOR_HOLIDAY_ORDER 白名單挑出可以當標題的節日名稱(去重、去掉補假/小年夜等非節日標記)。 */
export function headlineNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (!MAJOR_HOLIDAY_ORDER.includes(n)) continue;
    const label = shortLabel(n);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function longWeekendTitle(w: LongWeekend): string {
  const heads = headlineNames(w.names);
  return heads.length > 0 ? `${heads.join('・')}連假` : `連假(${w.start} 起 ${w.days} 天)`;
}

/** 起始日 MMDD 當 slug,同一年度內連假區間不重疊,保證唯一;不用節日中文名稱是避免翻譯/斷詞產生歧義。 */
export function longWeekendSlug(w: LongWeekend): string {
  return w.start.slice(5).replace('-', '');
}

export function findLongWeekend(data: CalendarYearData, slug: string): LongWeekend | undefined {
  return data.long_weekends.find((w) => longWeekendSlug(w) === slug);
}

// Phase 1 驗收發現(見 DECISIONS.md 2026-09-01):端午/中秋/教師節是否形成連假,兩年結果不同,
// 不得寫死通用文案。這裡逐年現算,頁面直接用這個結果組句子,不猜測、不套用另一年的結論。
const NOTABLE_SOLO_HOLIDAYS = ['端午節', '中秋節', '孔子誕辰紀念日/教師節'];

export interface NotableFestivalCheck {
  name: string;
  date: string | null;
  formsLongWeekend: boolean;
}

export function notableFestivalChecks(data: CalendarYearData): NotableFestivalCheck[] {
  return NOTABLE_SOLO_HOLIDAYS.map((rawName) => {
    const day = data.days.find((d) => d.memo === rawName);
    const name = shortLabel(rawName);
    if (!day) return { name, date: null, formsLongWeekend: false };
    const formsLongWeekend = data.long_weekends.some((w) => day.d >= w.start && day.d <= w.end);
    return { name, date: day.d, formsLongWeekend };
  });
}

interface HolidayBlock {
  start: string;
  end: string;
  startIdx: number;
  endIdx: number;
  /** 非空備註(排除補假)清單,依出現順序、不去重——只用來判斷「這個區塊是否錨定在真正的國定假日上」。 */
  namedDays: string[];
}

function buildHolidayBlocks(days: CalendarDay[]): HolidayBlock[] {
  const blocks: HolidayBlock[] = [];
  let i = 0;
  while (i < days.length) {
    if (!days[i].is_holiday) {
      i++;
      continue;
    }
    const startIdx = i;
    const namedDays: string[] = [];
    while (i < days.length && days[i].is_holiday) {
      if (days[i].memo && days[i].memo !== '補假') namedDays.push(days[i].memo);
      i++;
    }
    blocks.push({ start: days[startIdx].d, end: days[i - 1].d, startIdx, endIdx: i - 1, namedDays });
  }
  return blocks;
}

export interface LeavePlan {
  start: string;
  end: string;
  totalDays: number;
  /** 需要另外請假的工作日,依日期排序。 */
  leaveDates: string[];
  /** 這個攻略錨定的國定假日名稱(已去重、排除補假)。 */
  anchorNames: string[];
}

const MAX_BRIDGE_GAP = 3;

/**
 * 拼假攻略:找出「已成形的國定假日區塊」與前後緊鄰假期區塊(通常是純週末)之間 <=3 個工作日的
 * 缺口,提出「請這幾天假,就能連放更長假期」的建議。只錨定在含真正國定假日(非純週末、非補假)
 * 的區塊上,避免對任何兩個普通週末之間的一週工作日都提案「請4天放9天」這種對本站主題(國定假日)
 * 而言毫無資訊量的通用建議(2026-09-01 拍板,見 DECISIONS.md,原型比對曾出現此問題)。每個錨點只
 * 往前、往後各接一次緊鄰區塊,不無限延伸串接多個區塊。
 */
export function computeLeavePlans(data: CalendarYearData): LeavePlan[] {
  const days = data.days;
  const blocks = buildHolidayBlocks(days);
  const plans: LeavePlan[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.namedDays.length === 0) continue;

    let mergedStart = block.start;
    let mergedEnd = block.end;
    const leaveDates: string[] = [];

    if (idx > 0) {
      const prev = blocks[idx - 1];
      const gap = days.slice(prev.endIdx + 1, block.startIdx).map((d) => d.d);
      if (gap.length >= 1 && gap.length <= MAX_BRIDGE_GAP) {
        mergedStart = prev.start;
        leaveDates.unshift(...gap);
      }
    }
    if (idx < blocks.length - 1) {
      const next = blocks[idx + 1];
      const gap = days.slice(block.endIdx + 1, next.startIdx).map((d) => d.d);
      if (gap.length >= 1 && gap.length <= MAX_BRIDGE_GAP) {
        mergedEnd = next.end;
        leaveDates.push(...gap);
      }
    }

    if (leaveDates.length === 0) continue;

    const seen = new Set<string>();
    const anchorNames = block.namedDays.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
    const totalDays = Math.round((Date.parse(mergedEnd) - Date.parse(mergedStart)) / 86_400_000) + 1;
    plans.push({ start: mergedStart, end: mergedEnd, totalDays, leaveDates, anchorNames });
  }

  return plans;
}

export function leavePlanTitle(plan: LeavePlan): string {
  const heads = headlineNames(plan.anchorNames);
  const label = heads.length > 0 ? heads.join('・') : plan.anchorNames.map(shortLabel).join('・');
  return `${label}拼假攻略`;
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** RFC5545 全天事件的 DTEND 是「不含」的下一天,不是最後一天本身。 */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 產生單一年度的 .ics 訂閱內容。只收錄「備註非空」的放假日(國定假日/補假等,約 20 餘筆/年),
 * 不含純週六日的空白放假列——訂閱這份行事曆的人本來就知道週末,塞進去只是雜訊。
 */
export function buildIcsFeed(data: CalendarYearData, siteBase: string, generatedAt: Date): string {
  const dtstamp = `${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}T${generatedAt
    .toISOString()
    .slice(11, 19)
    .replace(/:/g, '')}Z`;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MengWaBa//Taiwan Public Holidays ' + data.year + '//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:中華民國政府行政機關辦公日曆表 ${data.year} 年(悶蛙吧)`,
    'X-WR-TIMEZONE:Asia/Taipei',
  ];
  for (const day of data.days) {
    if (!day.is_holiday || !day.memo) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsDate(day.d)}-mengwaba-calendar@mengwaba.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(day.d)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(day.d))}`,
      `SUMMARY:${icsEscape(day.memo)}`,
      `DESCRIPTION:${icsEscape(`資料來源:行政院人事行政總處辦公日曆表,詳見 ${siteBase}/calendar/${data.year}/`)}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
