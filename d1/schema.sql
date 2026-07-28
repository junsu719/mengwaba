-- Phase 4.5 D1 schema:垃圾車清運點資料表
-- 單一資料庫涵蓋全部已上線縣市,以 city_slug 區分,供行政區頁與清運點頁 on-demand 查詢使用。
--
-- 重要:正式環境一律用 CREATE TABLE IF NOT EXISTS,不可 DROP TABLE。
-- 匯入腳本(Phase 2 步驟 3)以「單一縣市」為更新單位(季度手動、逐縣市執行,見 DECISIONS.md 2026-07-17),
-- 若對整張表 DROP/重建,會連帶清空其他已上線縣市尚未到更新週期的資料。匯入腳本需自行對
-- 目標 city_slug 做 DELETE 再 INSERT(或等效的 upsert),不影響其他縣市的既有列。

CREATE TABLE IF NOT EXISTS points (
  point_id           TEXT PRIMARY KEY,  -- pipeline/normalize.py 產生,格式 {縣市代碼}-{行政區SLUG}-{序號},如 KHH-NANZI-00001;跨縣市前綴不同,天然全域唯一
  city                TEXT NOT NULL,     -- 縣市顯示名稱,如「高雄市」(對應現有 CollectionPoint.city,site/src/lib/content.ts 的 FAQ 文案直接引用)
  city_slug           TEXT NOT NULL,     -- 對應 site/src/lib/data.ts 的 CITIES[].slug,如 kaohsiung
  district            TEXT NOT NULL,     -- 行政區顯示名稱,如「楠梓區」
  district_slug       TEXT NOT NULL,     -- 由 point_id 解析而得(對應現有 parsePointId 邏輯),如 nanzi
  village             TEXT,              -- 里別,可為 NULL
  point_name          TEXT NOT NULL,
  address             TEXT,
  lat                 REAL,              -- 可為 NULL;非 NULL 不代表座標一定落在台灣範圍內,頁面層依鐵律 6 自行判斷是否輸出 GeoCoordinates
  lng                 REAL,
  schedule            TEXT NOT NULL,     -- JSON 字串(ScheduleEntry[] 序列化),讀出後 JSON.parse 還原
  recycling_schedule  TEXT,              -- JSON 字串,同上格式;NULL 表示該點無資源回收時刻資料(如目前全部高雄資料)
  foodscraps_schedule TEXT,              -- JSON 字串,同上格式;NULL 表示該點無廚餘收運時刻資料(2026-07-28 新北市新增維度,見 DECISIONS.md)。
                                          -- 注意:CREATE TABLE IF NOT EXISTS 對已存在的正式環境表是 no-op,既有表需靠 d1/migrations/002-add-foodscraps-schedule.sql 套用此欄位。
  collection_type     TEXT,              -- 「定點清運」或「沿街收運」;可為 NULL,部分縣市資料源(如桃園、新北)無法區分兩者,不得斷言其中一種,見 DECISIONS.md D3
  notes               TEXT,
  source              TEXT NOT NULL,     -- 資料來源 URL(逐筆,來自 pipeline fetch 階段)
  fetched_at          TEXT NOT NULL      -- ISO 8601,pipeline fetch 時間戳
);

-- 行政區頁與清運點頁的查詢皆為「整個行政區」(WHERE city_slug = ? AND district_slug = ?):
-- 清運點頁需要同區其他點做 nearestPoints 排序,天生沒有「只查單一點」的路徑,故不另建 point_id 專用索引(PK 已覆蓋)。
CREATE INDEX IF NOT EXISTS idx_points_district ON points(city_slug, district_slug);

-- 舊格式(全域流水號)point_id → 新格式(內容雜湊)point_id 的 301 導向對照表。
-- 背景:2026-07-22 point_id 改內容雜湊方案後,已被 Google 索引的舊格式清運點網址全數 404,
-- 見 DECISIONS.md 2026-07-28 事故記錄。[point].astro 偵測到純數字 pointSlug(舊格式特徵)時
-- 查這張表,查到就 301 導向、查不到維持誠實 404。資料由 pipeline/build_legacy_redirects.py +
-- pipeline/push_legacy_redirects_d1.py 產生,只收「唯一可信賴配對」,不猜測配對。
-- 注意:CREATE TABLE IF NOT EXISTS 對已存在的正式環境表是 no-op,既有 DB 需靠
-- d1/migrations/003-legacy-point-redirects.sql 套用這張新表。
CREATE TABLE IF NOT EXISTS legacy_point_redirects (
  city_slug     TEXT NOT NULL,
  district_slug TEXT NOT NULL,
  old_slug      TEXT NOT NULL,
  new_point_id  TEXT NOT NULL,
  PRIMARY KEY (city_slug, district_slug, old_slug)
);
