# 決策記錄

格式:日期 | 決策 | 理由 | 層級(自主/Jun 拍板/跳過關卡)

---

2026-07-08 | 專案任務分級定為 L2,並以 Jun 事先撰寫的 trash-pseo-spec.md(含 §11.5 成功指標與放棄條件)取代正式 /kickoff 流程 | Jun 在對話開場已明確提供完整規格書並確認 §11.5 為驗收標準,等同完成 kickoff 應確認的核心事項(問題、變現、成功指標、放棄條件);另建正式 CLAUDE.md「已確認目標」區塊落實鐵律 9 | Jun 拍板

2026-07-08 | 系統 python3 為 3.9.6,不符 spec 要求的 3.12,改用 `brew install python@3.12` 安裝並以 `/opt/homebrew/bin/python3.12 -m venv .venv` 建立專案虛擬環境 | spec §3 明定 Python 3.12;避免用系統版本导致未來套件相容性問題 | 自主

2026-07-08 | Phase 0 完成:目錄骨架、CLAUDE.md、DECISIONS.md、.env.example、.gitignore、scripts/notify.py(Telegram 通知模組)| 依 spec §9 Phase 0 範圍執行 | 自主

2026-07-08 | Phase 0 完成,Phase 1 待下次 session 開始 | Jun 今日休息,收尾動作(git commit、claude-bible 範本、環境地圖登記)已完成後結束本次 session | Jun 拍板

2026-07-09 | Phase 1 高雄市資料來源:改用高雄市開放資料平台(data.kcg.gov.tw)的全市單一 CSV 資源(resource GUID a6ba725a-488c-4d40-b5a2-c2fe65d3e134,`https://data.kcg.gov.tw/File/DirectDownload/{guid}`),不採用 spec §4 原訂優先序 | 逐一查證結果:①spec 列的來源#1(data.gov.tw/dataset/25888)實際是桃園市資料集且已下架,同平台高雄市對應的 dataset/98147 也已下架,均不可用;②來源#2(環境部 hwms.moenv.gov.tw)頁面有明顯反爬蟲 JS 挑戰腳本,一般 httpx 請求無法取得實際內容,且該防護本身即暗示不歡迎程式化抓取;③來源#3(高雄市開放資料平台)有結構完整、欄位與 spec §6 吻合的全市 CSV(19,038 筆),採用政府資料開放授權條款第一版(明文允許商業利用),但站台 robots.txt 內容為 `User-agent: * / Disallow: /`,僅放行 Googlebot/Bingbot/GPTBot 等具名搜尋引擎爬蟲。已逐一排查該站是否有獨立於網頁爬蟲限制之外的專屬 API/檔案 endpoint(檢查資源頁「API」分頁、/Guid 導覽頁、/About 頁、sitemap.xml、是否存在 api.kcg.gov.tw 等子網域、第三方鏡像 odportal.tw 是否自行代管檔案),結果:該站僅有 data.kcg.gov.tw 單一網域,/Json/Get/{guid} 與 /File/DirectDownload/{guid} 皆與網頁本體同網域、同 robots 政策,無獨立豁免的機器存取端點;odportal.tw 雖自身 robots.txt 開放,但其登記的資源下載連結仍指向 data.kcg.gov.tw,無法繞開。與 Jun 討論後拍板:確認無乾淨的合規 API 路徑後,採低頻善意抓取(User-Agent 誠實標明專案名稱「trash-pseo」與聯絡 email junsu578@gmail.com、單一 citywide 檔案、節流 ≥2 秒、每日僅抓一次),非大量頁面爬蟲,且資料本身合法開放商用,作為風險與效益間的折衷 | Jun 拍板

2026-07-09 | Phase 1 驗收通過(Jun 人工核對自家巷口清運時間無誤)。同時拍板:座標超出台灣範圍(L2 檢出,109 筆/0.62%)的清運點,資料層維持原值不竄改,但 Astro 頁面層不得為該點輸出 geo 座標相關 JSON-LD(如 GeoCoordinates),只顯示地址文字 | 錯誤地理標記(如頁面聲稱清運點在境外)若被 Google 判定為結構化資料造假,可能損害整站 SEO 信譽;不竄改資料層是為保留原始資料可追溯性(鐵律2 絕不填假值),問題留在頁面呈現層解決。已同步寫入 CLAUDE.md 鐵律 6 | Jun 拍板

2026-07-09 | Phase 2 進度:Astro 站台與高雄市全部頁面(首頁、縣市頁、35 個行政區頁、18,805 個清運點頁,共 18,842 頁)已完成並本地 build 成功(6 秒內,含 sitemap 分片 dist/sitemap-0.xml、sitemap-1.xml),JSON-LD 條件式規則(鐵律6)已驗證正確運作。**卡在 Lighthouse 自動化驗收**:本機(Mac mini)未安裝 Chrome/Chromium(僅有 Safari),Lighthouse 依賴 Chrome DevTools Protocol 無法用 Safari 執行。與 Jun 討論後,Jun 選擇下次 session 前自行安裝 Chrome,屆時採「安裝 headless Chromium(`npx playwright install chromium`)執行自動化 Lighthouse」方式恢復驗收,本次 session 到此為止,不強行安裝瀏覽器 | Jun 拍板

2026-07-09 | 額外發現(非本專案程式碼問題):`~/.npm/_cacache` 內有 root 擁有的殘留檔案,導致一般權限 `npm install`/`npx` 報 EACCES。Phase 2 開發時以 `npm install/npx --cache <暫存路徑>` 繞過,未動使用者全域 npm 快取 | sudo 相關的全域環境修復(`chown`)屬影響本機其他專案的變更,不在未經明確同意下執行;已記入 CLAUDE.md 已知問題,留待 Jun 自行處理或明確同意後再修 | 自主(繞過方式)+ Jun 待決(是否執行 chown)
