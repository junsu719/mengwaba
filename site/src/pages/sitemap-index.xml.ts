import type { APIRoute } from 'astro';
import { CITIES } from '../lib/data';

/**
 * S1(2026-07-27 拍板):取代 @astrojs/sitemap 的自動輸出(已從 astro.config.mjs 移除)。
 * 依城市拆分而非單一大檔的理由(見 DECISIONS.md 2026-07-27):
 * ①單一 sitemap 檔上限 50,000 網址/50MB,全站已 46,500+ 筆接近上限,之後加縣市必爆;
 * ②GSC 會分別報告每個子 sitemap 的索引覆蓋率,能看出「高雄 90%、桃園 40%」這種差異,
 * 直接支援後續是否繼續擴充縣市的判斷。
 *
 * 這支本身不查 D1(城市清單來自靜態的 CITIES 註冊表),prerender 預設值即可,
 * 不需要額外快取邏輯。
 */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const files = ['sitemap-static.xml', ...CITIES.map((c) => `sitemap-${c.slug}.xml`)];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    files.map((f) => `<sitemap><loc>${base}/${f}</loc></sitemap>`).join('') +
    `</sitemapindex>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
