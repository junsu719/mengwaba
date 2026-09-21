// 讀取 data/normalized/deities/deities.json(scripts/build_deity_pages_data.py 的輸出,
// 見 DECISIONS.md 2026-09-21 條目)。神明生日頁全靜態、不碰 D1,比照 calendar.ts 的做法
// 用 import.meta.glob 在 build 時把資料內嵌進模組,不在執行期讀檔案。
//
// v1 範圍僅 24 尊三源一致神明(deity_birthdays.csv 主表);unverified.csv 的候選(開臺聖王、
// 臨水夫人)留待第二批,本模組不處理。

import { toFolkMonthLabel } from './lunar-format';

export interface DeityDate {
  solar_year: number;
  solar_date: string;
  weekday: string;
  date_adjusted: boolean;
  adjust_note: string | null;
}

export interface DeitySource {
  url: string;
  name: string;
}

export interface DeityOccasion {
  lunar_month: number;
  lunar_day: number;
  lunar_label: string;
  occasion_type: string;
  /** occasion_type 與敬稱完全同義時(如「聖誕」對「聖誕」)為 null,不提供新資訊時不顯示。 */
  honorific_source: string | null;
  sources: DeitySource[];
  /** 讀者導向的補充說明(scripts/build_deity_pages_data.py 的 OCCASION_NOTE_OVERRIDE),
   * 大多數紀念日沒有額外說明,為 null。 */
  note: string | null;
  dates: DeityDate[];
}

export interface Deity {
  deity_name: string;
  common_name: string | null;
  slug: string;
  title: string;
  body_alt_names: string[];
  body_note: string | null;
  occasions: DeityOccasion[];
}

const deityModules = import.meta.glob<{ default: Deity[] }>('../../../data/normalized/deities/deities.json', {
  eager: true,
});

function loadAll(): Deity[] {
  const entry = Object.values(deityModules)[0];
  if (!entry) throw new Error('找不到 data/normalized/deities/deities.json,請先執行 scripts/build_deity_pages_data.py');
  return entry.default;
}

let _all: Deity[] | null = null;

export function getAllDeities(): Deity[] {
  if (!_all) _all = loadAll();
  return _all;
}

export function getDeityBySlug(slug: string): Deity | undefined {
  return getAllDeities().find((d) => d.slug === slug);
}

export interface UpcomingOccasionEntry {
  deitySlug: string;
  deityTitle: string;
  occasionType: string;
  lunarLabel: string;
  solarDate: string;
  dateAdjusted: boolean;
  adjustNote: string | null;
}

/** 攤平成「每尊神明 x 每個紀念日 x 每個年度」一筆,供總覽頁「近期神明生日」與 findUpcomingOccasions 使用。 */
export function allOccasionEntries(): UpcomingOccasionEntry[] {
  return getAllDeities().flatMap((deity) =>
    deity.occasions.flatMap((occ) =>
      occ.dates.map((d) => ({
        deitySlug: deity.slug,
        deityTitle: deity.title,
        occasionType: occ.occasion_type,
        lunarLabel: toFolkMonthLabel(occ.lunar_label),
        solarDate: d.solar_date,
        dateAdjusted: d.date_adjusted,
        adjustNote: d.adjust_note,
      }))
    )
  );
}

/**
 * 純函式,不碰時鐘/時區——「今天」一律由呼叫端(client-side script)用 Asia/Taipei 算出再傳入,
 * 與 calendar.ts 的 findNextLongWeekend 同一個理由:頁面經邊緣快取,伺服器端算好的「近期」
 * 對之後才看到快取版本的訪客會是錯的。回傳依日期排序、篩選 solarDate >= todayStr 的前 limit 筆。
 */
export function findUpcomingOccasions(
  entries: UpcomingOccasionEntry[],
  todayStr: string,
  limit: number
): UpcomingOccasionEntry[] {
  return entries
    .filter((e) => e.solarDate >= todayStr)
    .sort((a, b) => a.solarDate.localeCompare(b.solarDate))
    .slice(0, limit);
}
