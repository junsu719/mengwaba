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
