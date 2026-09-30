// 清運點頁「今天」卡片的伺服器端資料(2026-09-30,見 DECISIONS.md):
// 頁面可能被快取,伺服器端不能決定「今天是星期幾」,所以這裡預先算出週一到週日各 7 份文案,
// 交給前端用 Asia/Taipei 的今天挑一份。所有判斷(是否沿街收運、星期是否未知、時間文字)
// 一律沿用 content.ts / data.ts 既有函式的結果,這裡只組合,不重寫。
import type { CollectionPoint, ScheduleEntry } from './data';
import { isWeekdayUnknown, todayScheduleEntry } from './data';
import { scheduleTimeText, todaySummarySentence } from './content';

/** 廚餘「今天」句只出現在新北(唯一有 foodscraps_schedule 維度的縣市)。 */
const FOODSCRAPS_CITY = '新北市';

function entryOnWeekday(entries: ScheduleEntry[] | undefined, weekday: number): ScheduleEntry | null {
  // 星期未知的 entry weekday 為 [],includes 必為 false:不會被誤判成「今天有收」。
  return entries?.find((s) => s.weekday.includes(weekday)) ?? null;
}

/**
 * 桃園這類星期未知的點:卡片內不斷言今天有沒有收,改用專用句(2026-09-30 Jun 定稿),
 * 「前往查詢」連結由前端接在句尾(只改卡片呈現,班表區既有的 weekdayUnknownNotice 不動)。
 */
function unknownNotice(point: CollectionPoint): string | null {
  const unknown = point.schedule.filter(isWeekdayUnknown);
  if (unknown.length === 0) return null;
  const times = [...new Set(unknown.map((s) => s.arrive))];
  return `本站尚未取得收運星期。到站時間約 ${times.join('、')},完整班表請以官方系統為準`;
}

export function hasUnknownWeekday(point: CollectionPoint): boolean {
  return point.schedule.some(isWeekdayUnknown);
}

/** weekday: 1(週一)~7(週日)。只講時間,不說車輛是否相同。 */
export function todayCardLines(point: CollectionPoint, weekday: number): string[] {
  const lines = [unknownNotice(point) ?? todaySummarySentence(point, weekday)];

  const recycling = entryOnWeekday(point.recycling_schedule, weekday);
  if (recycling) lines.push(`今天資源回收:${scheduleTimeText(recycling, point.collection_type)}`);

  if (point.city === FOODSCRAPS_CITY) {
    const food = entryOnWeekday(point.foodscraps_schedule, weekday);
    if (food) lines.push(`今天廚餘:${scheduleTimeText(food, point.collection_type)}`);
  }
  return lines;
}

export function todayCardDays(point: CollectionPoint): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (let w = 1; w <= 7; w++) out[w] = todayCardLines(point, w);
  return out;
}

/**
 * 國定假日/補假日當天的第一行(2026-09-30 Jun 定稿):班表是每週固定班表,不知道國定假日,
 * 不可說「正常收運」。只在「依班表今天本來就有收」時替換;本來就沒收、純回收點、星期未知的點維持原文案。
 */
export const HOLIDAY_FIRST_LINE = '依每週班表今天有收運。今天是國定假日,實際收運請以當地清潔隊公告為準';

/** weekday -> 國定假日當天的第一行;只包含需要替換的星期,其餘星期前端沿用 todayCardDays 的文案。 */
export function todayCardHolidayFirst(point: CollectionPoint): Record<number, string> {
  const out: Record<number, string> = {};
  for (let w = 1; w <= 7; w++) if (todayScheduleEntry(point, w)) out[w] = HOLIDAY_FIRST_LINE;
  return out;
}
