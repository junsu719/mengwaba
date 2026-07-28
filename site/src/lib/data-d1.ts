import type { CollectionPoint, DistrictGroup } from './data';

/** Cloudflare D1 binding 型別,見 wrangler.jsonc 的 d1_databases[0].binding = "POINTS_DB"。 */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all(): Promise<{ results: Record<string, unknown>[] }>;
    };
  };
}

function rowToPoint(row: Record<string, unknown>): CollectionPoint {
  return {
    point_id: row.point_id as string,
    city: row.city as string,
    district: row.district as string | null,
    village: row.village as string | null,
    point_name: row.point_name as string | null,
    address: row.address as string | null,
    lat: row.lat as number | null,
    lng: row.lng as number | null,
    schedule: JSON.parse(row.schedule as string),
    recycling_schedule: row.recycling_schedule ? JSON.parse(row.recycling_schedule as string) : undefined,
    collection_type: row.collection_type as string | null,
    notes: row.notes as string | null,
    source: row.source as string,
    fetched_at: row.fetched_at as string,
  };
}

/**
 * 查詢單一行政區的全部清運點(d1/schema.sql 的 idx_points_district 索引覆蓋此查詢)。
 * 行政區頁與清運點頁皆用這支函式:清運點頁需要同區其他點做「鄰近清運點」,
 * 天生沒有「只查單一點」的路徑,見 d1/schema.sql 註解。
 */
export async function loadDistrictFromD1(
  db: D1Like,
  citySlug: string,
  districtSlug: string
): Promise<CollectionPoint[]> {
  const { results } = await db
    .prepare('SELECT * FROM points WHERE city_slug = ? AND district_slug = ?')
    .bind(citySlug, districtSlug)
    .all();
  return results.map(rowToPoint);
}

export function toDistrictGroup(points: CollectionPoint[], districtSlug: string): DistrictGroup | null {
  if (points.length === 0) return null;
  return { district: points[0].district!, districtSlug, points };
}

/**
 * 查舊格式(全域流水號)point_id 是否有對應的新格式(內容雜湊)point_id,供 301 導向用。
 * 見 d1/schema.sql 的 legacy_point_redirects 表與 DECISIONS.md 2026-07-28 事故記錄——
 * 2026-07-22 point_id 改雜湊方案後已索引的舊網址全數 404,這支查詢是修復手段。
 * 查不到回傳 null,呼叫端維持既有 404,不猜測配對。
 */
export async function lookupLegacyRedirect(
  db: D1Like,
  citySlug: string,
  districtSlug: string,
  oldSlug: string
): Promise<string | null> {
  const { results } = await db
    .prepare('SELECT new_point_id FROM legacy_point_redirects WHERE city_slug = ? AND district_slug = ? AND old_slug = ?')
    .bind(citySlug, districtSlug, oldSlug)
    .all();
  return results.length > 0 ? (results[0].new_point_id as string) : null;
}

/** 舊格式 pointSlug 特徵:純數字流水號(如 "06852"),新格式一律含雜湊字母,兩者不重疊。 */
export function isLegacyPointSlug(pointSlug: string): boolean {
  return /^\d+$/.test(pointSlug);
}
