/**
 * 產生 site/src/data/district-index.json:{citySlug: {district, districtSlug}[]}。
 *
 * 背景(2026-08-27,見 DECISIONS.md):loadCityDistrictList()(site/src/lib/data-d1.ts)原本用
 * `SELECT DISTINCT district, district_slug FROM points WHERE city_slug = ?` 查 D1,只為了行政區頁
 * 「同縣市其他行政區」的連結清單。DISTINCT 不改變 rows_read——D1 仍要掃過該縣市全部列才能算出
 * distinct 值,大縣市(如新北)單一行政區頁請求就會把整個縣市的 rows_read 算進帳,是 2026-08-25
 * D1 額度優化拆掉「整區查詢」後,少數還留著的全縣市規模查詢。行政區清單本質是隨資料更新才變動的
 * 低頻靜態資訊,不需要每次請求都查 D1,故改成 build-time 產生的小檔案,執行期直接 import。
 *
 * 資料來源與 publishable 過濾邏輯,刻意與 pipeline/push_d1.py 的 classify()、
 * site/src/lib/data-static.ts 的 loadCityPoints() 保持一致:三者都是從同一份 data/normalized/*.json
 * 過濾出「會被發佈成頁面」的子集,只是消費端不同(D1 匯入 / 靜態頁面 / 本檔案)。任何一處的過濾
 * 邏輯改變,若沒有同步改其餘兩處,會出現「行政區清單有 X 區,但點進去 404」或反過來「某區有點但
 * 清單漏列」的不一致——見 CLAUDE.md 鐵律 10 同類教訓(改變資料形狀時只驗證單一消費端)。
 *
 * district_slug 由 point_id 解析而得,解析邏輯與 site/src/lib/data.ts 的 parsePointId()、
 * pipeline/push_d1.py 的 parse_district_slug() 相同(依 "-" 結構切分取第二段,轉小寫)——直接
 * import parsePointId 重用,不重寫一份平行邏輯。
 *
 * 執行方式:node --experimental-strip-types scripts/build-district-index.ts(於 site/ 目錄下),
 * 已接入 npm run build(見 package.json),每次 build 都會重新產生,確保與當下 data/normalized/
 * 內容同步。輸出檔案本身也需要 git 追蹤(不能只在 build 時存在)——原因是它是 D1 匯入之外唯一
 * 消費 data/normalized/ 的「已發佈行政區清單」來源,若不進 git,clone 下來的環境在還沒手動重新
 * 產生前,build 出的頁面會暫時看不到「同縣市其他行政區」連結,且無法從 git history 追蹤這份
 * 清單何時因為資料更新而改變。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CITIES, parsePointId, type CollectionPoint } from '../src/lib/data.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const NORMALIZED_DIR = path.join(ROOT, 'data', 'normalized');
const OUT_PATH = path.join(__dirname, '../src/data/district-index.json');

/** 與 pipeline/push_d1.py 的 classify()、site/src/lib/data-static.ts 的 loadCityPoints() 同一份過濾條件。 */
function isPublishable(p: CollectionPoint): boolean {
  return Boolean(
    p.district &&
      p.point_name &&
      (p.schedule.length > 0 ||
        (p.recycling_schedule?.length ?? 0) > 0 ||
        (p.foodscraps_schedule?.length ?? 0) > 0)
  );
}

const index: Record<string, { district: string; districtSlug: string }[]> = {};

for (const city of CITIES) {
  const srcPath = path.join(NORMALIZED_DIR, `${city.file}.json`);
  const records: CollectionPoint[] = JSON.parse(readFileSync(srcPath, 'utf-8'));
  const publishable = records.filter(isPublishable);

  const districtBySlug = new Map<string, string>();
  for (const p of publishable) {
    const parsed = parsePointId(p.point_id);
    if (!parsed) continue; // 與其他消費端一致:point_id 格式異常時該筆無法歸類,略過不影響其餘筆
    if (!districtBySlug.has(parsed.districtSlug)) districtBySlug.set(parsed.districtSlug, p.district!);
  }

  index[city.slug] = [...districtBySlug.entries()]
    .map(([districtSlug, district]) => ({ district, districtSlug }))
    .sort((a, b) => a.districtSlug.localeCompare(b.districtSlug));
}

writeFileSync(OUT_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');

const summary = CITIES.map((c) => `${c.slug}: ${index[c.slug].length} 區`).join(', ');
console.log(`[build-district-index] 寫入 ${path.relative(ROOT, OUT_PATH)}(${summary})`);
