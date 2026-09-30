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
