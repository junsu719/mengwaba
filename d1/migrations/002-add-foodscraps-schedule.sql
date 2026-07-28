-- Migration 002:新增 foodscraps_schedule 欄位(廚餘收運時刻)
--
-- 背景:2026-07-28 拍板(見 DECISIONS.md),新北市資料源(data.ntpc.gov.tw「新北市垃圾車路線」)
-- 除了一般垃圾(garbage*)、資源回收(recycling*)外,還有廚餘(foodscraps*)獨立一組七天
-- 星期旗標——現有 D1 schema 完全沒有這個維度,需要新增欄位才能承載這批資料。但正式環境的
-- points 表是用舊版 d1/schema.sql 建立的,CREATE TABLE IF NOT EXISTS 對已存在的表是 no-op,
-- 不會套用新增的欄位定義,因此需要這支獨立的 migration。
--
-- SQLite(D1 底層)不支援 ALTER TABLE ... ADD COLUMN 之外的欄位重新定義,但**新增可為 NULL
-- 的欄位其實可以直接用 ALTER TABLE ... ADD COLUMN**(不像 001 的「改既有欄位 NOT NULL 約束」
-- 那樣一定要走建新表流程)。這裡仍然採用與 001 一致的「建新表→搬資料→刪舊表→改名」模式,
-- 理由是保持兩支 migration 風格一致、且一次把 schema.sql 與正式環境徹底同步(避免只用
-- ALTER TABLE ADD COLUMN 導致 schema.sql 檔案本身與正式環境的建表語句長期不同步)。
--
-- 執行前置條件(尚未執行,待 Jun 核准):
-- ①先在非正式環境(本機 --local 或另建一個測試用 D1 database)完整跑過一次,確認搬移後
--   資料筆數、每個縣市抽樣幾筆內容都與遷移前一致,才對 --remote 執行(依 CLAUDE.md 鐵律 8)。
-- ②執行前用 `wrangler d1 export mengwaba-trash-points --remote --output=backup.sql`
--   完整備份現有資料,確認備份檔案非空、可還原,才執行本 migration(依鐵律 7 精神)。
-- ③依 001 的實測經驗:**不要**用 BEGIN TRANSACTION/COMMIT 包裝這批語句,D1 的 remote
--   匯入機制本身就是把整個檔案當一個批次處理,只留裸的 DDL/DML 語句序列。
-- ④本次 migration 執行時,新北市資料本身尚未真的匯入(見 pipeline/push_d1.py 的 COLUMNS
--   尚未加入 foodscraps_schedule,那是之後真的要把新北推 D1 時才需要改的範圍,不在本次
--   資料層工作範圍內)——這支 migration 只負責讓 points 表的欄位定義先就緒。
--
-- 執行指令(核准後才執行,不在本次對話內跑):
--   npx wrangler d1 execute mengwaba-trash-points --remote --file=d1/migrations/002-add-foodscraps-schedule.sql

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
  foodscraps_schedule TEXT,              -- 新增欄位,見上方背景說明
  collection_type     TEXT,
  notes               TEXT,
  source              TEXT NOT NULL,
  fetched_at          TEXT NOT NULL
);

INSERT INTO points_new SELECT
  point_id, city, city_slug, district, district_slug, village, point_name, address,
  lat, lng, schedule, recycling_schedule, NULL, collection_type, notes, source, fetched_at
FROM points;

DROP TABLE points;

ALTER TABLE points_new RENAME TO points;

CREATE INDEX IF NOT EXISTS idx_points_district ON points(city_slug, district_slug);

-- 驗證(migration 執行完後手動跑,確認搬移無誤):
--   SELECT city_slug, COUNT(*) FROM points GROUP BY city_slug;
--   -- 應與 migration 前的筆數逐一相符(高雄、台中、桃園三個 city_slug)
--   SELECT COUNT(*) FROM points WHERE foodscraps_schedule IS NOT NULL;
--   -- migration 剛執行完應該是 0(既有三縣市資料本來就沒有這個維度),等新北資料真的
--   -- 匯入後這個數字才會 >0
