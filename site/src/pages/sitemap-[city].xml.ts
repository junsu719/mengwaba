import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CITIES, parsePointId } from '../lib/data';
import type { D1Like } from '../lib/data-d1';

export const prerender = false;

// S2-fix(2026-07-27 拍板):Cache API 是邊緣快取、以 URL(cache key)為鍵,不會因
// wrangler versions deploy 重新部署而清空——「重新部署會自動失效」的假設是錯的。改用
// 「資料版本進 cache key」:cache key 附上該城市 MAX(fetched_at),資料一變版本字串就變,
// 舊快取自動失聯(不用手動 purge),而不是靠 TTL 期望它剛好在對的時間過期。
// TTL 本身可以放更長(改用資料版本失效後,TTL 只是 Cloudflare 邊緣保留快取物件的上限,
// 不再是唯一的失效機制),故從 1 天延長為 7 天。
const CACHE_SECONDS = 60 * 60 * 24 * 7; // 7 天

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc: string, lastmod: string | null): string {
  const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
  return `<url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
}

/** ISO 8601 字串在本專案 pipeline 一律固定用 +08:00 時區輸出(見 normalize.py 慣例),字典序比較等同時間序比較。 */
function maxLastmod(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Workers 執行環境才有 caches.default;本地型別環境不一定有宣告,防禦性取用、拿不到就略過快取。 */
function getEdgeCache(): Cache | null {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  return c ?? null;
}

export const GET: APIRoute = async ({ params, site, request }) => {
  const citySlug = params.city;
  const city = CITIES.find((c) => c.slug === citySlug);
  if (!city) {
    return new Response('Not Found', { status: 404 });
  }

  const db = (env as unknown as { POINTS_DB?: unknown }).POINTS_DB;
  if (!db) {
    return new Response('D1 binding 未設定(POINTS_DB)', { status: 500 });
  }

  // 版本查詢:單欄聚合、WHERE city_slug=? 吃得到 idx_points_district(city_slug, district_slug)
  // 這個既有複合索引的前綴,不是全表掃描——每次請求都會跑這條,但成本必須遠低於下面的全量查詢,
  // 否則快取失去意義(2026-07-27 Jun 提醒)。
  let cityVersion: string;
  try {
    const versionResult = await (db as D1Like)
      .prepare('SELECT MAX(fetched_at) AS max_fetched_at FROM points WHERE city_slug = ?')
      .bind(citySlug)
      .all();
    const maxFetchedAt = versionResult.results[0]?.max_fetched_at;
    cityVersion = typeof maxFetchedAt === 'string' ? maxFetchedAt : 'unknown';
  } catch {
    return new Response('D1 查詢失敗,請稍後重試', { status: 503 });
  }

  const edgeCache = getEdgeCache();
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('_v', cityVersion);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  if (edgeCache) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) return cached;
  }

  let rows: { point_id: string; district_slug: string; fetched_at: string | null }[];
  try {
    const result = await (db as D1Like)
      .prepare('SELECT point_id, district_slug, fetched_at FROM points WHERE city_slug = ?')
      .bind(citySlug)
      .all();
    rows = result.results as typeof rows;
  } catch {
    // D1 查詢失敗:回傳 5xx 讓 Google 稍後重試,不得回傳空但格式正確的 sitemap
    // (那等於告訴 Google 這個城市沒有任何頁面,可能導致已索引頁面被誤下架)。
    return new Response('D1 查詢失敗,請稍後重試', { status: 503 });
  }

  if (rows.length === 0) {
    // 同上一條原則:查無資料視為異常(該城市理應在 D1 有資料),不回傳空 sitemap。
    return new Response('查無該城市資料,可能是 D1 尚未匯入或暫時異常', { status: 503 });
  }

  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const districtLastmod = new Map<string, string | null>();
  // 城市索引頁的 lastmod 直接沿用上面已經查過的 cityVersion(同一個 MAX(fetched_at)),
  // 不必再掃一次全部 rows 重算,兩者定義上本來就該是同一個值。
  const cityLastmod: string | null = cityVersion === 'unknown' ? null : cityVersion;
  const pointUrls: string[] = [];

  for (const r of rows) {
    const parsed = parsePointId(r.point_id);
    if (!parsed) continue; // 與其他頁面一致:point_id 格式異常時該筆無法組出合法連結,略過不影響其餘筆
    const { districtSlug, pointSlug } = parsed;
    pointUrls.push(urlEntry(`${base}/trash/${citySlug}/${districtSlug}/${pointSlug}/`, r.fetched_at));
    districtLastmod.set(districtSlug, maxLastmod(districtLastmod.get(districtSlug) ?? null, r.fetched_at));
  }

  const districtUrls = [...districtLastmod.entries()].map(([slug, lastmod]) =>
    urlEntry(`${base}/trash/${citySlug}/${slug}/`, lastmod)
  );

  const body =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urlEntry(`${base}/trash/${citySlug}/`, cityLastmod) +
    districtUrls.join('') +
    pointUrls.join('') +
    `</urlset>`;

  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });

  if (edgeCache) {
    await edgeCache.put(cacheKey, response.clone());
  }
  return response;
};
