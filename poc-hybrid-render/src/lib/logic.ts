import type { CollectionPoint } from './types';

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

export function todayWeekdayTaipei(): number {
  const now = new Date(Date.now() + TAIPEI_OFFSET_MS);
  const utcDay = now.getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function todayScheduleEntry(p: CollectionPoint, weekday = todayWeekdayTaipei()): ScheduleEntryResult {
  return p.schedule.find((s) => s.weekday.includes(weekday)) ?? null;
}

type ScheduleEntryResult = CollectionPoint['schedule'][number] | null;
