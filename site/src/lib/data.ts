// 讀取 data/normalized/*.json 的實作在 ./data-static.ts(僅供仍為靜態預生成的頁面/端點使用,
// 見該檔案開頭註解:Phase 4.5 Step 4 改用 build-time bundle 讀取,原本這裡的 fs.readFileSync
// 版本在 @astrojs/cloudflare adapter 的 prerender 沙箱環境中無法存取任何 host 檔案系統路徑,
// 含絕對路徑,已實測確認並非僅是 process.cwd() 問題)。此檔案(data.ts)保持純邏輯、不依賴檔案系統,
// 讓 on-demand D1 頁面(行政區頁/清運點頁)引入時不會連帶把整個縣市 JSON 打包進部署用的 Worker。

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
  /** 資源回收時刻,與 schedule 同形狀;非所有縣市資料皆有此欄位(如高雄無),頁面層需判斷是否存在再顯示區塊。 */
  recycling_schedule?: ScheduleEntry[];
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

export interface CityInfo {
  slug: string;
  name: string;
  /** data/normalized/ 底下對應的檔名(不含副檔名) */
  file: string;
  sourceName: string;
  sourceUrl: string;
}

/** 已上線縣市,依上線順序排列;新增縣市頁面生成完成後在此註冊即可,頁面層皆已依此清單動態產生路由。 */
export const CITIES: CityInfo[] = [
  {
    slug: 'kaohsiung',
    name: '高雄市',
    file: 'kaohsiung',
    sourceName: '高雄市政府環境保護局',
    sourceUrl: 'https://data.kcg.gov.tw/',
  },
  {
    slug: 'taichung',
    name: '臺中市',
    file: 'taichung',
    sourceName: '臺中市政府',
    sourceUrl: 'https://data.gov.tw/dataset/84004',
  },
];

/** 全台縣市總數(直轄市+縣市),用於「其餘 N 縣市尚未上線」文案計算,見 CLAUDE.md Phase 4 範圍。 */
export const TOTAL_TAIWAN_COUNTY_COUNT = 22;

export function getCity(slug: string): CityInfo {
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) throw new Error(`未知縣市 slug: ${slug}`);
  return city;
}

/** point_id 格式為 {縣市代碼}-{行政區SLUG}-{序號},由 pipeline/normalize.py 產生。直接解析避免兩邊維護重複對照表。 */
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
