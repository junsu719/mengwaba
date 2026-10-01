import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CITIES, parsePointId } from '../../lib/data';
import { loadPointById, type D1Like } from '../../lib/data-d1';
import { officialQuerySystem } from '../../lib/content';
import { hasUnknownWeekday, todayCardDays, todayCardHolidayFirst, type HomePointToday } from '../../lib/today-card';

export const prerender = false;

// 首頁「今天」列的「我家清運點」資料(瀏覽器端依 localStorage 的 point_id 呼叫)。只呼叫既有
// loadPointById(PK 等值查詢,rows_read=1),不新增查詢類型;不讀、不存任何使用者資料。
// 「今天是星期幾」由前端決定,這裡只回週一~週日 7 份文案(與清運點頁今天卡片同一組函式)。
// 狀態碼:查無/ID 格式不合 → 404(前端據此清掉舊設定);D1 異常 → 500(前端只隱藏該行,不清設定)。
const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id') ?? '';
  const parsed = id.length <= 100 ? parsePointId(id) : null;
  if (!parsed) return json({ error: 'not_found' }, 404, 'no-store');

  const db = (env as unknown as { POINTS_DB?: D1Like }).POINTS_DB;
  if (!db) return json({ error: 'unavailable' }, 500, 'no-store');

  try {
    const point = await loadPointById(db, id);
    const city = point ? CITIES.find((c) => c.name === point.city) : null;
    if (!point || !city) return json({ error: 'not_found' }, 404, 'public, max-age=300');
    const body: HomePointToday = {
      name: point.point_name ?? point.point_id,
      url: `/trash/${city.slug}/${parsed.districtSlug}/${parsed.pointSlug}/`,
      days: todayCardDays(point),
      holidayFirst: todayCardHolidayFirst(point),
      queryUrl: hasUnknownWeekday(point) ? (officialQuerySystem(point)?.url ?? null) : null,
    };
    return json(body, 200, 'public, max-age=300');
  } catch {
    return json({ error: 'unavailable' }, 500, 'no-store');
  }
};
