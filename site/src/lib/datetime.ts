/**
 * 全站共用的「今天」判定(2026-09-22 合併,見 DECISIONS.md):一律回傳 Asia/Taipei 當地日期
 * (YYYY-MM-DD),不依賴執行環境(伺服器/瀏覽器)的本地時區。
 *
 * 原本行事曆(NextLongWeekend.astro)、農民曆(lunar-client.ts 供 TodayLunarCard.astro /
 * UpcomingDeityBirthdays.astro / birthday-convert 使用)、神明頁「下一次」計算各自定義了一份
 * 幾乎相同的函式,合併為這裡的單一實作,避免「今天」的定義分散在多處各寫一套。
 *
 * 呼叫端一律在瀏覽器端呼叫(不可在 Astro frontmatter/build time 呼叫)——頁面經 Cloudflare
 * 邊緣快取,build time 算好的「今天」對之後才看到快取版本的訪客會是錯的,唯一正確做法是
 * client-side script 現算。
 */
export function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

/**
 * 由 taipeiToday() 產生的 YYYY-MM-DD 推導星期(1=週一…7=週日,與 data.ts 的 weekday 慣例一致)。
 * 純日期字串一律以 UTC 午夜解讀,不受執行環境時區影響;格式不合回傳 null,呼叫端不得渲染。
 */
export function taipeiWeekday(dateStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const day = new Date(t).getUTCDay();
  return day === 0 ? 7 : day;
}

/** 台北當地現在時刻 HH:MM(24 小時制),給「下一班」比較用;與 taipeiToday() 同樣只能在瀏覽器端呼叫。 */
export function taipeiNowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}
