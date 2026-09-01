import type { APIRoute } from 'astro';
import { CALENDAR_YEARS, loadCalendarYear, longWeekendSlug, computeLeavePlans } from '../lib/calendar';

/**
 * S1(2026-07-27 拍板):首頁與 /trash/ 這兩個純靜態頁面獨立成一份極小的 sitemap,
 * 不需要查 D1(prerender 預設值,build 時就能算完),避免跟各城市 sitemap-{city}.xml
 * 混在一起、也避免跟 @astrojs/sitemap 自動產生的檔案在 /sitemap-index.xml 這個路徑上
 * 互相打架(該套件已從 astro.config.mjs 移除,改由這三支 sitemap-*.xml.ts 完全接手)。
 *
 * 2026-09-01 新增行事曆工具頁面(全靜態、25 頁以內,見 DECISIONS.md):與首頁/工具首頁
 * 同屬不查 D1 的靜態集合,一併收在這份 sitemap;.ics 訂閱端點不是給搜尋引擎索引的頁面,
 * 不放進 sitemap。
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
  const urls = [`${base}/`, `${base}/trash/`, `${base}/calendar/`, ...calendarUrls];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${u}</loc></url>`).join('') +
    `</urlset>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
