import type { APIRoute, GetStaticPaths } from 'astro';
import { CALENDAR_YEARS, loadCalendarYear, buildIcsFeed } from '../../lib/calendar';

// build time 產生靜態 .ics(2026-09-01 拍板,見 DECISIONS.md):比照這個工具「全靜態、不碰
// D1」的方向,不做 on-demand 產生。季度/年度更新資料後需重新 build + deploy 才會反映新年度
// 資料,與行政區頁的既有慣例(CLAUDE.md「資料更新與機器角色」段落)一致。
//
// 重要:這支路由沒有設 `prerender = false`,output:'static' 預設下 GET() 只在 build 時被呼叫
// 一次、把回傳的 body 寫成靜態檔(見 dist/client/calendar/{year}.ics),之後正式環境的請求完全
// 由 Cloudflare 的 assets 靜態資源層直接回應,不會再執行這段程式碼——下面 Response 裡設的
// Content-Type/Content-Disposition **只影響 build 產物本身,不影響正式環境實際送出的 HTTP
// 標頭**(2026-09-01 版本專屬預覽驗證時發現:assets 層依副檔名猜 MIME type,回應中完全沒有
// charset 也沒有 Content-Disposition)。實際會生效的標頭改用 `site/public/_headers` 宣告
// (Astro/Cloudflare adapter 既有機制,`/_astro/*` 的 immutable Cache-Control 也是同一套),
// 這裡的標頭保留是為了本機 `astro preview`(走 SSR 模擬,會真的執行這段程式碼)時行為一致。
export const getStaticPaths: GetStaticPaths = () => CALENDAR_YEARS.map((year) => ({ params: { year: String(year) } }));

const generatedAt = new Date();

export const GET: APIRoute = ({ params, site }) => {
  const year = Number(params.year);
  const data = loadCalendarYear(year);
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const body = buildIcsFeed(data, base, generatedAt);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="mengwaba-holidays-${year}.ics"`,
    },
  });
};
