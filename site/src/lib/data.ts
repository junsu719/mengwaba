import fs from 'node:fs';
import path from 'node:path';

// data/normalized/ 是 pipeline 的輸出,site/ 與 pipeline/ 為同一 repo 下的兄弟目錄。
// 用 process.cwd() 而非 import.meta.url 解析,因為 build 後檔案會被 bundler 搬到 dist/ 內部,
// 原始檔案的相對路徑在 bundle 後不成立;astro build/dev 固定從 site/ 目錄執行,cwd 穩定可靠。
const DATA_ROOT = path.resolve(process.cwd(), '../data/normalized');

export interface ScheduleEntry {
  weekday: number[];
  arrive: string;
  depart: string;
}

export interface CollectionPoint {
  point_id: string;
  city: string;
  district: string | null;
  village: string | null;
  point_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  schedule: ScheduleEntry[];
  collection_type: string;
  notes: string | null;
  source: string;
  fetched_at: string;
}

export const TAIWAN_LAT_RANGE: [number, number] = [21.5, 25.5];
export const TAIWAN_LNG_RANGE: [number, number] = [119.5, 122.5];

export function hasValidGeo(p: CollectionPoint): p is CollectionPoint & { lat: number; lng: number } {
  return (
    p.lat !== null &&
    p.lng !== null &&
    p.lat >= TAIWAN_LAT_RANGE[0] &&
    p.lat <= TAIWAN_LAT_RANGE[1] &&
    p.lng >= TAIWAN_LNG_RANGE[0] &&
    p.lng <= TAIWAN_LNG_RANGE[1]
  );
}

export const CITY_SLUG = 'kaohsiung';
export const CITY_NAME = '高雄市';

const _cache = new Map<string, CollectionPoint[]>();

/** 讀取指定縣市的正規化資料,僅保留 L1 必填欄位(district/point_name/schedule)齊全、可發佈成頁面的清運點。 */
export function loadCityPoints(citySlugFile: string): CollectionPoint[] {
  if (_cache.has(citySlugFile)) return _cache.get(citySlugFile)!;
  const filePath = path.join(DATA_ROOT, `${citySlugFile}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const all: CollectionPoint[] = JSON.parse(raw);
  const publishable = all.filter((p) => p.district && p.point_name && p.schedule.length > 0);
  _cache.set(citySlugFile, publishable);
  return publishable;
}

export function loadKaohsiungPoints(): CollectionPoint[] {
  return loadCityPoints('kaohsiung');
}

/** point_id 格式為 KHH-{行政區SLUG}-{序號},由 pipeline/normalize.py 產生。直接解析避免兩邊維護重複對照表。 */
export function parsePointId(pointId: string): { districtSlug: string; pointSlug: string } {
  const m = pointId.match(/^[A-Z]+-([A-Z]+)-(\d+)$/);
  if (!m) throw new Error(`無法解析 point_id: ${pointId}`);
  return { districtSlug: m[1].toLowerCase(), pointSlug: m[2] };
}

export interface DistrictGroup {
  district: string;
  districtSlug: string;
  points: CollectionPoint[];
}

export function groupByDistrict(points: CollectionPoint[]): DistrictGroup[] {
  const map = new Map<string, DistrictGroup>();
  for (const p of points) {
    const { districtSlug } = parsePointId(p.point_id);
    let group = map.get(districtSlug);
    if (!group) {
      group = { district: p.district!, districtSlug, points: [] };
      map.set(districtSlug, group);
    }
    group.points.push(p);
  }
  return [...map.values()].sort((a, b) => a.districtSlug.localeCompare(b.districtSlug));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 鄰近清運點:僅在同一行政區內搜尋(全市 19,000+ 筆兩兩比對過重,且跨區步行距離對垃圾車查詢意義不大)。
 * 有效座標的點以實際距離排序;座標缺漏/超出台灣範圍的點,退回同村里優先、同行政區次之的名單順序。
 */
export function nearestPoints(target: CollectionPoint, districtPoints: CollectionPoint[], n = 5): CollectionPoint[] {
  const others = districtPoints.filter((p) => p.point_id !== target.point_id);

  if (hasValidGeo(target)) {
    const withGeo = others.filter(hasValidGeo);
    return withGeo
      .map((p) => ({ p, d: haversineKm(target.lat as number, target.lng as number, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map((x) => x.p);
  }

  const sameVillage = others.filter((p) => p.village && p.village === target.village);
  const rest = others.filter((p) => !(p.village && p.village === target.village));
  return [...sameVillage, ...rest].slice(0, n);
}

export const WEEKDAY_NAMES = ['', '一', '二', '三', '四', '五', '六', '日'];

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 依 build 當下時間換算台北時區的 ISO weekday(1=一...7=日)。 */
export function todayWeekdayTaipei(): number {
  const now = new Date(Date.now() + TAIPEI_OFFSET_MS);
  const utcDay = now.getUTCDay(); // 0=Sun..6=Sat
  return utcDay === 0 ? 7 : utcDay;
}

export function todayScheduleEntry(p: CollectionPoint, weekday = todayWeekdayTaipei()): ScheduleEntry | null {
  return p.schedule.find((s) => s.weekday.includes(weekday)) ?? null;
}
