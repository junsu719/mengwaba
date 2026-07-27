import type { APIRoute } from 'astro';

/**
 * S1(2026-07-27 拍板):首頁與 /trash/ 這兩個純靜態頁面獨立成一份極小的 sitemap,
 * 不需要查 D1(prerender 預設值,build 時就能算完),避免跟各城市 sitemap-{city}.xml
 * 混在一起、也避免跟 @astrojs/sitemap 自動產生的檔案在 /sitemap-index.xml 這個路徑上
 * 互相打架(該套件已從 astro.config.mjs 移除,改由這三支 sitemap-*.xml.ts 完全接手)。
 */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const urls = [`${base}/`, `${base}/trash/`];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${u}</loc></url>`).join('') +
    `</urlset>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
