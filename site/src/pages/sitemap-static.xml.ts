import type { APIRoute } from 'astro';
import { CALENDAR_YEARS, loadCalendarYear, longWeekendSlug, computeLeavePlans } from '../lib/calendar';
import { getAllDeities } from '../lib/deities';
import { GAMES } from '../lib/games';

/**
 * S1(2026-07-27 拍板):首頁與 /trash/ 這兩個純靜態頁面獨立成一份極小的 sitemap,
 * 不需要查 D1(prerender 預設值,build 時就能算完),避免跟各城市 sitemap-{city}.xml
 * 混在一起、也避免跟 @astrojs/sitemap 自動產生的檔案在 /sitemap-index.xml 這個路徑上
 * 互相打架(該套件已從 astro.config.mjs 移除,改由這三支 sitemap-*.xml.ts 完全接手)。
 *
 * 2026-09-01 新增行事曆工具頁面(全靜態、25 頁以內,見 DECISIONS.md):與首頁/工具首頁
 * 同屬不查 D1 的靜態集合,一併收在這份 sitemap;.ics 訂閱端點不是給搜尋引擎索引的頁面,
 * 不放進 sitemap。
 *
 * 2026-09-21 新增農民曆工具頁面(全靜態、v1 僅 24 尊神明頁,見 DECISIONS.md):同屬不查 D1
 * 的靜態集合。今日農曆/沖煞/宜忌/節氣一律瀏覽器端即時算,build 時只需要 24 尊神明頁的
 * slug 清單即可完整列出 sitemap,不受這個限制影響。
 *
 * 2026-09-25 新增 /games/ 遊戲專區:純靜態自包含頁面(不查 D1、不走垃圾車/行事曆/農民曆
 * 資料流程),遊戲清單來自 lib/games.ts 註冊表,同屬這份不查 D1 的靜態集合。
 */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const calendarUrls = CALENDAR_YEARS.flatMap((year) => {
    const data = loadCalendarYear(year);
    const urls = [
      `${base}/calendar/${year}/`,
      ...data.long_weekends.map((w) => `${base}/calendar/${year}/${longWeekendSlug(w)}/`),
    ];
    if (computeLeavePlans(data).length > 0) urls.push(`${base}/calendar/${year}/leave-plan/`);
    return urls;
  });
  const deityUrls = getAllDeities().map((d) => `${base}/lunar/deity/${d.slug}/`);
  const gameUrls = GAMES.filter((g) => g.status === 'live').map((g) => `${base}/games/${g.slug}/`);
  const urls = [
    `${base}/`,
    `${base}/trash/`,
    `${base}/calendar/`,
    ...calendarUrls,
    `${base}/lunar/`,
    `${base}/lunar/about/`,
    `${base}/lunar/birthday-convert/`,
    ...deityUrls,
    `${base}/games/`,
    ...gameUrls,
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${u}</loc></url>`).join('') +
    `</urlset>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
