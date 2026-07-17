import type { CollectionPoint } from './types';

// Option C: 資料存 Cloudflare D1,render 時用 SQL 查詢。
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first(): Promise<Record<string, unknown> | null>;
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

export async function loadPointFromD1(db: D1Like, pointId: string): Promise<CollectionPoint | null> {
  const row = await db.prepare('SELECT * FROM points WHERE point_id = ?').bind(pointId).first();
  return row ? rowToPoint(row) : null;
}

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
