import type { CollectionPoint, DistrictGroup } from './data';
import districtIndex from '../data/district-index.json';

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
    foodscraps_schedule: row.foodscraps_schedule
      ? JSON.parse(row.foodscraps_schedule as string)
      : undefined,
    collection_type: row.collection_type as string | null,
    notes: row.notes as string | null,
    source: row.source as string,
    fetched_at: row.fetched_at as string,
  };
}

/**
 * 查詢單一行政區的全部清運點(d1/schema.sql 的 idx_points_district 索引覆蓋此查詢)。
 * 僅供行政區頁使用(該頁本來就要列出全區)。清運點頁 2026-08-25 起改用 loadPointById +
 * loadNearbyCandidates,不再借用這支「整區」查詢——見 DECISIONS.md 2026-08-25 D1 額度事故:
 * 板橋(6,779 點)、新莊(4,706 點)等大行政區,單一清運點頁請求就會讀進整區資料,是 D1 免費
 * 額度(500 萬 rows/天)超額 3 倍以上的主因(佔 87%)。
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

/**
 * URL 的 city slug 對應到 point_id 前綴(pipeline/normalize.py ID_PREFIXES +
 * pipeline/parse_kaohsiung_pdf.py 的 assign_point_ids 呼叫處字面值),供 buildPointId 組回完整
 * point_id 直接打 PK 查詢用。新增縣市時,pipeline 那邊會多一個前綴,這裡務必同步新增一筆,
 * 否則該縣市清運點頁會全部誤判為 404(找不到 point_id 對應的前綴時 buildPointId 回傳 null,
 * 呼叫端會 fallback 到「找不到」分支,不會誤查到別縣市的點)。
 */
const CITY_POINT_ID_PREFIX: Record<string, string> = {
  kaohsiung: 'KHH',
  taichung: 'TXG',
  taoyuan: 'TYN',
  xinbei: 'XBC',
};

/**
 * 組回完整 point_id(PK)。point_id 格式為 {前綴}-{district_slug 大寫}-{10 碼雜湊},見
 * pipeline/point_id.py 的 assign_point_ids()。pointSlug 直接沿用 URL 路徑片段(即
 * parsePointId 解析出的原始大小寫,不額外轉換),因為現有連結產生處(如本頁「鄰近清運點」)
 * 本來就是直接把 parsePointId 的 pointSlug 原樣塞進 href,兩邊大小寫規則必須一致。
 * 前綴查無對應(未知縣市)時回傳 null,呼叫端落入既有「找不到」分支,不猜測組出錯誤 ID。
 */
export function buildPointId(citySlug: string, districtSlug: string, pointSlug: string): string | null {
  const prefix = CITY_POINT_ID_PREFIX[citySlug];
  if (!prefix) return null;
  return `${prefix}-${districtSlug.toUpperCase()}-${pointSlug}`;
}

/**
 * 依完整 point_id(PK)查單一清運點。point_id 是 points 表的 PRIMARY KEY,等值查詢一律
 * rows_read=1,是 2026-08-25 D1 額度優化的核心:清運點頁不再需要撈整個行政區才能顯示一個點。
 */
export async function loadPointById(db: D1Like, pointId: string): Promise<CollectionPoint | null> {
  const { results } = await db.prepare('SELECT * FROM points WHERE point_id = ?').bind(pointId).all();
  return results.length > 0 ? rowToPoint(results[0]) : null;
}

/**
 * 清運點頁 404 時仍想顯示行政區 context(見 DECISIONS.md 2026-07-28:高雄 269 個舊格式網址
 * 查無對應點,但可以帶行政區列表連結)。只需要行政區顯示名稱是否存在,不需要撈整區,故
 * LIMIT 1——city_slug+district_slug 是 idx_points_district 的完整鍵值等值查詢,查無資料時
 * SQLite 靠 B-tree seek 就能判定「這個範圍是空的」,不會因為 LIMIT 1 而退化成全表/全區掃描。
 */
export async function loadDistrictDisplayName(
  db: D1Like,
  citySlug: string,
  districtSlug: string
): Promise<string | null> {
  const { results } = await db
    .prepare('SELECT district FROM points WHERE city_slug = ? AND district_slug = ? LIMIT 1')
    .bind(citySlug, districtSlug)
    .all();
  return results.length > 0 ? (results[0].district as string) : null;
}

/**
 * 「鄰近清運點」候選集:限量後精算(2026-08-25 拍板,見 DECISIONS.md)。原本 nearestPoints()
 * 是對整個行政區的點做 haversine 距離排序(有效座標)或村里優先排序(無座標,見 kaohsiung/
 * taichung——這兩市全部 39,421 筆皆無座標,一律走村里優先分支),但這正是清運點頁被綁死要讀
 * 整區資料的原因。改為:優先只查「同村里」的點(地理上通常已經夠近,且 kaohsiung/taichung
 * 這兩個佔全站過半資料的縣市原本就是照村里排序,候選集只查同村里對這兩市而言是完全等價、
 * 不犧牲精準度的);同村里筆數不足(< MIN_GOOD_CANDIDATES,含村里為 null 的情況)才擴大到
 * 整個行政區,但仍有 WIDEN_CANDIDATE_LIMIT 上限,不會退化回原本的無上限整區撈取。
 *
 * 犧牲(僅影響有座標排序的新北/桃園):極少數情況下,真正地理最近的點剛好落在鄰村而不在候選
 * 集內,不會被選中——Jun 已拍板接受此取捨(見 DECISIONS.md),换取單次請求 rows_read 從「整個
 * 行政區」(可能上千列,如板橋 6,779)降到最多 WIDEN_CANDIDATE_LIMIT 列。
 */
const VILLAGE_CANDIDATE_LIMIT = 200;
const WIDEN_CANDIDATE_LIMIT = 300;
const MIN_GOOD_CANDIDATES = 15;

export async function loadNearbyCandidates(
  db: D1Like,
  citySlug: string,
  districtSlug: string,
  village: string | null,
  excludePointId: string
): Promise<CollectionPoint[]> {
  if (village) {
    const { results } = await db
      .prepare(
        'SELECT * FROM points WHERE city_slug = ? AND district_slug = ? AND village = ? AND point_id != ? LIMIT ?'
      )
      .bind(citySlug, districtSlug, village, excludePointId, VILLAGE_CANDIDATE_LIMIT)
      .all();
    if (results.length >= MIN_GOOD_CANDIDATES) return results.map(rowToPoint);
  }
  const { results } = await db
    .prepare('SELECT * FROM points WHERE city_slug = ? AND district_slug = ? AND point_id != ? LIMIT ?')
    .bind(citySlug, districtSlug, excludePointId, WIDEN_CANDIDATE_LIMIT)
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

/**
 * 供行政區頁「站內連結:同縣市其他行政區」使用。改讀 build-time 產生的 site/src/data/district-index.json
 * (見 site/scripts/build-district-index.ts),不再查 D1(2026-08-27 拍板,見 DECISIONS.md)——原本的
 * `SELECT DISTINCT district, district_slug ... WHERE city_slug = ?` 雖然只回傳幾十列,但 D1 的
 * rows_read 計費是依「掃過的列數」而非「回傳的列數」,DISTINCT 仍要掃過該縣市全部列才能去重,
 * 大縣市(如新北)單一行政區頁請求就會把整個縣市的 rows_read 算進帳,是 2026-08-25 D1 額度優化
 * 拆掉「整區查詢」後少數還留著的全縣市規模查詢。行政區清單只隨季度資料更新才變動,不需要每次
 * 請求都即時查 D1。不再需要 db 參數,呼叫端(page.astro)也不需要 await。
 */
export function loadCityDistrictList(citySlug: string): { district: string; districtSlug: string }[] {
  return (districtIndex as Record<string, { district: string; districtSlug: string }[]>)[citySlug] ?? [];
}
