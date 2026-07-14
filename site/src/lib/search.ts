import type { CollectionPoint } from './data';
import { parsePointId } from './data';

export interface CityInput {
  slug: string;
  name: string;
  points: CollectionPoint[];
}

export interface DictEntry {
  s: string;
  n: string;
}

export type SearchPointRecord = [
  cityIndex: number,
  districtIndex: number,
  pointName: string,
  village: string | null,
  pointSlug: string,
];

export interface SearchIndex {
  cities: DictEntry[];
  districts: DictEntry[];
  points: SearchPointRecord[];
}

/**
 * 產生前端搜尋用的精簡索引:city/district 名稱只存一份於字典陣列,
 * points 內只存字典索引(數字)而非重複字串,避免 18,000+ 筆資料把 district/city
 * 名稱重複寫 18,000 次拖大檔案(對照 12.4MB 的 normalized 原始資料,不可整包丟給瀏覽器)。
 */
export function buildSearchIndex(cities: CityInput[]): SearchIndex {
  const cityDict: DictEntry[] = cities.map((c) => ({ s: c.slug, n: c.name }));
  const districtDict: DictEntry[] = [];
  const districtIndexMap = new Map<string, number>();
  const points: SearchPointRecord[] = [];

  cities.forEach((city, cityIndex) => {
    for (const p of city.points) {
      const { districtSlug, pointSlug } = parsePointId(p.point_id);
      const key = `${city.slug}:${districtSlug}`;
      let districtIndex = districtIndexMap.get(key);
      if (districtIndex === undefined) {
        districtIndex = districtDict.length;
        districtDict.push({ s: districtSlug, n: p.district ?? districtSlug });
        districtIndexMap.set(key, districtIndex);
      }
      points.push([cityIndex, districtIndex, p.point_name ?? '', p.village, pointSlug]);
    }
  });

  return { cities: cityDict, districts: districtDict, points };
}
