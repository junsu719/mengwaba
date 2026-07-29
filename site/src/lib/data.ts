// 讀取 data/normalized/*.json 的實作在 ./data-static.ts(僅供仍為靜態預生成的頁面/端點使用,
// 見該檔案開頭註解:Phase 4.5 Step 4 改用 build-time bundle 讀取,原本這裡的 fs.readFileSync
// 版本在 @astrojs/cloudflare adapter 的 prerender 沙箱環境中無法存取任何 host 檔案系統路徑,
// 含絕對路徑,已實測確認並非僅是 process.cwd() 問題)。此檔案(data.ts)保持純邏輯、不依賴檔案系統,
// 讓 on-demand D1 頁面(行政區頁/清運點頁)引入時不會連帶把整個縣市 JSON 打包進部署用的 Worker。

export interface ScheduleEntry {
  /**
   * 空陣列 `[]` 代表「未取得收運星期」(部分縣市資料源如桃園只有「班表時間:HH:MM」、無逐日星期欄位),
   * 不代表「這些天都不收運」——凡出現在 schedule 裡的 entry 必定有在收運,只是星期未知。
   * 一律用 `[]`、不用 `null`(型別維持 number[] 不變,消費端不需額外防 null);
   * 判斷用 isWeekdayUnknown(),不要直接檢查 .length === 0,避免語意分散。見 DECISIONS.md F1/F2(2026-07-24)。
   */
  weekday: number[];
  arrive: string;
  /** 可為 null:部分縣市資料源(如桃園)只有到站時間、無離站時間,不得用 arrive + N 分鐘等方式推算填補,見 DECISIONS.md。 */
  depart: string | null;
}

/** 見 ScheduleEntry.weekday 註解:空陣列是「星期未知」,不是「不收運」,判斷一律走這個 helper。 */
export function isWeekdayUnknown(entry: ScheduleEntry): boolean {
  return entry.weekday.length === 0;
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
  /**
   * 廚餘收運時刻,與 schedule 同形狀;目前僅新北市有此維度(2026-07-28 新增,見 DECISIONS.md)。
   * 新北資料裡一般垃圾/資源回收/廚餘三者共用同一個到站時間(同一輛車、同一時刻,只是依星期
   * 決定當天收運哪些品項),頁面層渲染廚餘區塊時需說明此點,避免使用者誤以為是三個不同時刻。
   */
  foodscraps_schedule?: ScheduleEntry[];
  /** 可為 null:部分縣市資料源(如桃園)無法區分定點/沿街,不得斷言其中一種,見 DECISIONS.md D3。頁面層需判斷是否存在再顯示相關文案。 */
  collection_type: string | null;
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
  {
    slug: 'taoyuan',
    name: '桃園市',
    file: 'taoyuan',
    sourceName: '桃園市政府環境保護局環境管理處',
    sourceUrl: 'https://route.tyoem.gov.tw/',
  },
  {
    slug: 'xinbei',
    name: '新北市',
    file: 'xinbei',
    sourceName: '新北市政府環境保護局',
    sourceUrl: 'https://data.ntpc.gov.tw/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8',
  },
];

/** 全台縣市總數(直轄市+縣市),用於「其餘 N 縣市尚未上線」文案計算,見 CLAUDE.md Phase 4 範圍。 */
export const TOTAL_TAIWAN_COUNTY_COUNT = 22;

export function getCity(slug: string): CityInfo {
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) throw new Error(`未知縣市 slug: ${slug}`);
  return city;
}

/**
 * point_id 格式為 {縣市代碼}-{行政區SLUG}-{序號},由 pipeline/normalize.py / pipeline/point_id.py 產生。
 * 依 "-" 做結構切分(第一段縣市代碼、第二段行政區、其餘 join 回去當序號),不對序號內容的字元集
 * 做任何假設——序號本身在下游只當不透明字串使用(分組鍵、URL 片段、字串相等比對),見 DECISIONS.md
 * 2026-07-22:序號從全數字改內容雜湊後,原本寫死 \d+ 的 regex 無法解析新格式,才改為結構切分。
 *
 * 解析不出合法結構時回傳 null,不 throw——內容展示站的單筆資料格式異常不該讓整頁 500,
 * 呼叫端須自行 fallback(略過該筆、或該筆連結退化為純文字),詳見各呼叫點註解。
 */
export function parsePointId(pointId: string): { districtSlug: string; pointSlug: string } | null {
  const parts = pointId.split('-');
  if (parts.length < 3) return null;
  const [, districtSlug, ...rest] = parts;
  if (!districtSlug || rest.some((s) => !s)) return null;
  return { districtSlug: districtSlug.toLowerCase(), pointSlug: rest.join('-') };
}

export interface DistrictGroup {
  district: string;
  districtSlug: string;
  points: CollectionPoint[];
}

export function groupByDistrict(points: CollectionPoint[]): DistrictGroup[] {
  const map = new Map<string, DistrictGroup>();
  for (const p of points) {
    const parsed = parsePointId(p.point_id);
    if (!parsed) continue; // point_id 格式異常時該筆無法歸類到任何行政區,略過不影響其餘點
    const { districtSlug } = parsed;
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
