// 清運點頁「今天」卡片的前端純函式(可在 vitest 直接測)。不碰時鐘:「今天」由呼叫端以
// taipeiToday() 傳入。任何一行算不出可靠結果一律回傳 null,呼叫端不渲染該行(不留空白/NaN/undefined)。
import { LUNAR_TABLE } from './lunar-table.generated';
import { findNextLongWeekend, daysBetween, type NextLongWeekendEntry } from './calendar';

const DAY_LABELS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 預先產生的對照表(scripts/gen-lunar-table.mjs)查農曆日期;超出涵蓋範圍回傳 null。 */
export function lunarLine(todayStr: string): string | null {
  const t = Date.parse(todayStr);
  if (Number.isNaN(t)) return null;
  for (const [start, year, month, leap, firstDay, days] of LUNAR_TABLE) {
    const offset = daysBetween(start, todayStr);
    if (offset >= 0 && offset < days) {
      const label = DAY_LABELS[firstDay - 1 + offset];
      if (!label) return null;
      return `今天農曆:${year}年${leap ? '閏' : ''}${month}${label}`;
    }
  }
  return null;
}

export function nextHolidayLine(entries: unknown, todayStr: string): string | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const next = findNextLongWeekend(entries as NextLongWeekendEntry[], todayStr);
  if (!next || typeof next.start !== 'string' || typeof next.end !== 'string' || !next.title) return null;
  const n = daysBetween(todayStr, next.start);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return `下一個連假:${next.title},還有 ${n} 天`;
  // 連假進行中(含第一天)(findNextLongWeekend 保證 end >= today):最後一天另外說明,否則說放到 MM/DD
  const until = next.end.slice(5).replace('-', '/');
  if (n === 0) return `連假中:${next.title},今天開始,放到 ${until}`;
  if (next.end === todayStr) return `連假中:${next.title},今天是最後一天`;
  return `連假中:${next.title},放到 ${until}`;
}

/** 挑出今天卡片第一區的文案:今天是國定假日/補假日且該星期有替換句時,第一行改用替換句。 */
export function pickTodayLines(
  days: Record<string, unknown> | null,
  holidayFirst: Record<string, unknown> | null,
  holidays: unknown,
  todayStr: string,
  weekday: number | null
): string[] | null {
  const lines = weekday && days ? days[String(weekday)] : null;
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every((l) => typeof l === 'string' && l)) return null;
  const out = [...(lines as string[])];
  const alt = weekday && holidayFirst ? holidayFirst[String(weekday)] : null;
  if (typeof alt === 'string' && alt && Array.isArray(holidays) && holidays.includes(todayStr)) out[0] = alt;
  return out;
}

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

/** 首頁「今天」列第一段:「今天:2026/10/01 週四」。格式不合或星期算不出回傳 null。 */
export function dateLine(todayStr: string, weekday: number | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr);
  const name = weekday ? WEEKDAY_NAMES[weekday - 1] : undefined;
  if (!m || !name) return null;
  return `今天:${m[1]}/${m[2]}/${m[3]} 週${name}`;
}

export interface NextRun {
  /** 0=今天、1=明天…最多 7(下週同一天)。 */
  offset: number;
  time: string;
  label: string;
  /** 排序用:越小越早。 */
  key: number;
}

/**
 * 下一班:今天還沒過的最早到站時間;今天都過了(或今天不收)就往後找最近一個有收的星期。
 * times 為 weekday(1-7) → HH:MM[](見 todayCardTimes);weekday/times 不合法或完全找不到回傳 null
 * (星期未知的點、純資源回收點),呼叫端不顯示「下一班」。nowHHMM 由呼叫端以台北時間傳入。
 */
export function nextRun(times: unknown, weekday: number | null, nowHHMM: string): NextRun | null {
  if (!times || typeof times !== 'object' || !weekday || !/^\d{2}:\d{2}$/.test(nowHHMM)) return null;
  const t = times as Record<string, unknown>;
  for (let offset = 0; offset <= 7; offset++) {
    const w = ((weekday - 1 + offset) % 7) + 1;
    const list = t[String(w)];
    if (!Array.isArray(list)) continue;
    const valid = list.filter((x): x is string => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x)).sort();
    const time = offset === 0 ? valid.find((x) => x >= nowHHMM) : valid[0];
    if (!time) continue;
    const label = offset === 0 ? '今天' : offset === 1 ? '明天' : `週${WEEKDAY_NAMES[w - 1]}`;
    const [h, m] = time.split(':').map(Number);
    return { offset, time, label: `${label} ${time}`, key: offset * 1440 + h * 60 + m };
  }
  return null;
}
