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
    collection_type: row.collection_type as string,
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
