-- Migration 001:collection_type 欄位改為可為 NULL
--
-- 背景:2026-07-23 拍板(見 DECISIONS.md),桃園市資料源無法區分「定點清運」/「沿街收運」,
-- 不得斷言其中一種,collection_type 必須能存 NULL。但正式環境的 points 表是用舊版
-- d1/schema.sql(collection_type TEXT NOT NULL)建立的,CREATE TABLE IF NOT EXISTS
-- 對已存在的表是 no-op,不會套用新的欄位定義,因此需要這支獨立的 migration。
--
-- SQLite(D1 底層)不支援 ALTER TABLE ... ALTER COLUMN 改欄位約束,標準做法是
-- 「建新表 → 搬資料 → 刪舊表 → 改名」。
--
-- 2026-07-24 實際對 --remote 執行後發現:**不能**用 BEGIN TRANSACTION/COMMIT 包裝
-- 這批語句——第一次執行得到 `{"D1_RESET_DO":true}`(內部 Durable Object 重置,
-- 已核對執行後 DB 確實乾淨回滾、未留下 points_new 或改變 schema/筆數),retry 後
-- 得到明確錯誤訊息:「請改用 state.storage.transaction()/transactionSync() API,
-- 不支援 SQL 的 BEGIN TRANSACTION 或 SAVEPOINT 語句」。D1 的 remote 匯入機制本身
-- 就是把整個檔案當一個批次處理,不需要(也不能)額外包一層 SQL transaction,故拿掉
-- BEGIN TRANSACTION/COMMIT,只留裸的 DDL/DML 語句序列。
--
-- 執行前置條件(尚未執行,待 Jun 核准):
-- ①先在非正式環境(本機 --local 或另建一個測試用 D1 database)完整跑過一次,
--   確認搬移後資料筆數、每個縣市的抽樣幾筆內容都與遷移前一致,才對 --remote 執行
--   (依 CLAUDE.md 鐵律 8:架構變動需先在非正式環境驗證)。
-- ②執行前用 `wrangler d1 export mengwaba-trash-points --remote --output=backup.sql`
--   完整備份現有資料,確認備份檔案非空、可還原,才執行本 migration(依鐵律 7 精神,
--   刪除/覆蓋前必須先有可回退路徑)。
-- ③預期停機:points_new 是全新空表,搬資料改名前這段時間內 city_slug/district_slug
--   索引查詢仍打在舊 points 表上,理論上無感;真正切換點只有 DROP+RENAME 這兩句之間,
--   SQLite 執行速度通常是毫秒級,但仍建議選低流量時段執行。
--
-- 執行指令(核准後才執行,不在本次對話內跑):
--   npx wrangler d1 execute mengwaba-trash-points --remote --file=d1/migrations/001-collection-type-nullable.sql

CREATE TABLE points_new (
  point_id           TEXT PRIMARY KEY,
  city                TEXT NOT NULL,
  city_slug           TEXT NOT NULL,
  district            TEXT NOT NULL,
  district_slug       TEXT NOT NULL,
  village             TEXT,
  point_name          TEXT NOT NULL,
  address             TEXT,
  lat                 REAL,
  lng                 REAL,
  schedule            TEXT NOT NULL,
  recycling_schedule  TEXT,
  collection_type     TEXT,              -- 改動點:NOT NULL → 可為 NULL,見上方背景說明
  notes               TEXT,
  source              TEXT NOT NULL,
  fetched_at          TEXT NOT NULL
);

INSERT INTO points_new SELECT
  point_id, city, city_slug, district, district_slug, village, point_name, address,
  lat, lng, schedule, recycling_schedule, collection_type, notes, source, fetched_at
FROM points;

DROP TABLE points;

ALTER TABLE points_new RENAME TO points;

CREATE INDEX IF NOT EXISTS idx_points_district ON points(city_slug, district_slug);

-- 驗證(migration 執行完後手動跑,確認搬移無誤):
--   SELECT city_slug, COUNT(*) FROM points GROUP BY city_slug;
--   -- 應與 migration 前的筆數逐一相符(高雄、台中兩個 city_slug)
--   SELECT COUNT(*) FROM points WHERE collection_type IS NULL;
--   -- migration 剛執行完應該是 0(現有高雄/台中資料本來就都有值,這支 migration
--   -- 只放寬約束、不改資料本身),等桃園資料真的匯入後這個數字才會 >0
