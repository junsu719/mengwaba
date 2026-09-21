// 這個模組只能在瀏覽器端執行(依賴 lunar-javascript 即時運算),不得在 Astro frontmatter
// (build 時/伺服器端)呼叫計算「今天」相關的函式——原則見 CLAUDE.md 農民曆工具範圍文件、
// 農民曆工具開工前置研究(DECISIONS.md 2026-09-21 條目):今日農曆/沖煞/宜忌/節氣一律
// 瀏覽器端算,不可在 build time 寫死,避免邊緣快取讓所有訪客看到同一天(build 當天)的
// 「今天」資料。與 calendar.ts 的 findNextLongWeekend 系列函式同一個理由、同一種寫法
// (參見該檔案開頭與 NextLongWeekend.astro 的說明)。
//
// 宜忌/吉神/凶煞的傳統依據、與市售黃曆比對結果、sect 參數選擇,詳見 DECISIONS.md
// 2026-09-21 條目;煞方/沖生肖為無版本分歧的固定公式,宜忌/吉神/凶煞為傳統通書查表法。
import { Lunar, Solar } from 'lunar-javascript';
import { toTraditional } from './lunar-term-s2t';

export interface DayLunarInfo {
  solarDate: string;
  lunarYearGanZhi: string;
  lunarMonthLabel: string;
  lunarDayLabel: string;
  isLeapMonth: boolean;
  zodiac: string;
  dayGanZhi: string;
  chongZodiac: string;
  chongGanZhi: string;
  shaDirection: string;
  yi: string[];
  ji: string[];
  jiShen: string[];
  xiongSha: string[];
  /** 若今天恰好是節氣當天,節氣名稱(繁體);否則 null。 */
  jieQiToday: string | null;
  prevJie: { name: string; date: string };
  nextJie: { name: string; date: string };
}

const CHONG_DESC_RE = /\((.*)\)(.+)/;

/** dateStr 格式 YYYY-MM-DD,呼叫端一律先用 Asia/Taipei 時區算出這個字串再傳入
 * (見 taipeiToday()),本函式本身不碰時鐘、不做時區轉換,避免「今天」的定義分散在多處。 */
export function computeDayLunar(dateStr: string): DayLunarInfo {
  const [y, m, d] = dateStr.split('-').map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  const chongDesc = lunar.getDayChongDesc();
  const chongMatch = CHONG_DESC_RE.exec(chongDesc);

  const jieQi = lunar.getJieQi();
  const prevJie = lunar.getPrevJie();
  const nextJie = lunar.getNextJie();

  return {
    solarDate: dateStr,
    lunarYearGanZhi: lunar.getYearInGanZhi(),
    lunarMonthLabel: lunar.getMonthInChinese() + '月',
    lunarDayLabel: lunar.getDayInChinese(),
    isLeapMonth: lunar.getMonth() < 0,
    zodiac: toTraditional(lunar.getYearShengXiao()),
    dayGanZhi: lunar.getDayInGanZhi(),
    chongZodiac: chongMatch ? toTraditional(chongMatch[2]) : '',
    chongGanZhi: chongMatch ? chongMatch[1] : '',
    shaDirection: toTraditional(lunar.getDaySha()),
    yi: lunar.getDayYi(1).map(toTraditional),
    ji: lunar.getDayJi(1).map(toTraditional),
    jiShen: lunar.getDayJiShen().map(toTraditional),
    xiongSha: lunar.getDayXiongSha().map(toTraditional),
    jieQiToday: jieQi ? toTraditional(jieQi) : null,
    prevJie: { name: toTraditional(prevJie.getName()), date: prevJie.getSolar().toYmd() },
    nextJie: { name: toTraditional(nextJie.getName()), date: nextJie.getSolar().toYmd() },
  };
}

/** 國曆日期轉農曆(用於農曆生日換算工具:輸入國曆生日 -> 查農曆月日)。 */
export function solarToLunar(dateStr: string): { monthLabel: string; dayLabel: string; isLeapMonth: boolean; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  return {
    monthLabel: lunar.getMonthInChinese() + '月',
    dayLabel: lunar.getDayInChinese(),
    isLeapMonth: lunar.getMonth() < 0,
    month: Math.abs(lunar.getMonth()),
    day: lunar.getDay(),
  };
}

export interface LunarToSolarResult {
  lunarYear: number;
  solarDate: string | null;
  /** 該農曆年沒有這個月日(例如閏月生日、當年該月不是閏月)時 true,solarDate 為 null。 */
  notExist: boolean;
}

/**
 * 農曆月日轉未來 N 個農曆年度對應的國曆日期(用於農曆生日換算工具反向查詢)。
 * isLeapMonth 為 true 但該農曆年這個月份不是閏月時,這年沒有對應日期(notExist=true),
 * 不強行算成平月的同月同日——這是兩件事,不能混為一談(比照 generate_deity_dates.py
 * 對農曆年邊界例外的處理原則:不存在就如實回報不存在,不靜默改寫使用者輸入的意思)。
 */
export function lunarToSolarRange(
  month: number,
  day: number,
  isLeapMonth: boolean,
  fromYear: number,
  toYear: number
): LunarToSolarResult[] {
  const results: LunarToSolarResult[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    try {
      const lunar = Lunar.fromYmd(y, isLeapMonth ? -month : month, day);
      results.push({ lunarYear: y, solarDate: lunar.getSolar().toYmd(), notExist: false });
    } catch {
      results.push({ lunarYear: y, solarDate: null, notExist: true });
    }
  }
  return results;
}

export function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}
