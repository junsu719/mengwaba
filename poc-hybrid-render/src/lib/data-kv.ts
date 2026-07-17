import type { CollectionPoint } from './types';

// Option B: 資料存 Cloudflare KV,render 時查詢。
// 存取模式:每個清運點一筆 key(point:{point_id}),每個行政區一筆「該區全部點」的
// 彙整 key(district:{city}:{districtSlug}),讓 nearestPoints() 不需整縣市資料即可運作。
export interface PointsKV {
  get(key: string, type: 'json'): Promise<unknown>;
}

export async function loadPointFromKV(kv: PointsKV, pointId: string): Promise<CollectionPoint | null> {
  const v = await kv.get(`point:${pointId}`, 'json');
  return (v as CollectionPoint) ?? null;
}

export async function loadDistrictFromKV(
  kv: PointsKV,
  citySlug: string,
  districtSlug: string
): Promise<CollectionPoint[]> {
  const v = await kv.get(`district:${citySlug}:${districtSlug}`, 'json');
  return (v as CollectionPoint[]) ?? [];
}
