-- Migration 003:新增 legacy_point_redirects 表(舊格式 point_id → 新格式 301 導向對照表)
--
-- 背景:2026-07-22 point_id 從全域流水號(如 KHH-MEINONG-06852)改成內容雜湊方案(如
-- KHH-MEINONG-5B3D524957)後,已被 Google 索引的舊格式清運點網址全數 404,7/22 起曝光與
-- 點擊雙雙歸零(見 DECISIONS.md 2026-07-28 事故記錄)。這支表供 [point].astro 在偵測到
-- 舊格式(純數字)pointSlug 時查詢,查到就 301 導向新網址,查不到維持誠實 404(不猜測配對)。
--
-- 這是全新的表,不涉及既有 points 表欄位變更,不需要像 001/002 那樣走「建新表→搬資料→
-- 刪舊表→改名」的重建流程,直接 CREATE TABLE IF NOT EXISTS 即可,對現有 points 表零影響。
--
-- 資料由 pipeline/build_legacy_redirects.py + pipeline/push_legacy_redirects_d1.py 產生
-- (data/legacy-redirects/{city_key}.json → d1/import/legacy_redirects.sql),對照表建立方式
-- 與覆蓋率見 DECISIONS.md:高雄 11,154/19,038(58.6%,因 2026-07-21 同時換了資料源,
-- 有 41.4% 舊點在新資料裡查無對應,如實記錄不猜測)、臺中 20,004/20,004(100%,舊資料
-- 本身沒變,只是重新雜湊)。桃園是新設站台,無舊格式網址問題,不在此表範圍內。
--
-- 執行前置條件(尚未執行,待 Jun 核准,依 CLAUDE.md 鐵律 7/8):
-- ①先在本機 --local D1 完整跑過一次,用已知的舊網址(如 /trash/kaohsiung/nanzi/00001/)
--   實測查詢邏輯正確,才對 --remote 執行。
-- ②這張表是全新增量表,對正式環境現有 points 表查詢路徑零風險,但新增 D1 表本身仍是
--   影響 production 資料庫的動作,依鐵律 7 需要 Jun 明確同意才執行 --remote。
--
-- 執行指令(核准後才執行,不在本次對話內跑):
--   npx wrangler d1 execute mengwaba-trash-points --local --file=d1/migrations/003-legacy-point-redirects.sql   (先本機驗證)
--   npx wrangler d1 execute mengwaba-trash-points --remote --file=d1/migrations/003-legacy-point-redirects.sql  (待核准後)

CREATE TABLE IF NOT EXISTS legacy_point_redirects (
  city_slug     TEXT NOT NULL,  -- 對應 site/src/lib/data.ts 的 CITIES[].slug,如 kaohsiung
  district_slug TEXT NOT NULL,  -- 由舊 point_id 解析而得,與現行 points.district_slug 同一套規則
  old_slug      TEXT NOT NULL,  -- 舊格式流水號(point_id 第三段起),如 "06852"、"00001"
  new_point_id  TEXT NOT NULL,  -- 現行雜湊 point_id,查到後解析出 pointSlug 供 301 導向組網址
  PRIMARY KEY (city_slug, district_slug, old_slug)
);

-- 驗證(migration 執行完後手動跑):
--   SELECT city_slug, COUNT(*) FROM legacy_point_redirects GROUP BY city_slug;
--   -- 應為高雄 11154、臺中 20004(與 data/legacy-redirects/*.json 筆數一致)
