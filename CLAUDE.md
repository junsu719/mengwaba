# trash-pseo — 專案規範

## 開發環境(鎖定)
本專案只在 **Mac mini M4**、路徑 `~/projects/trash-pseo` 開發與執行(pipeline、launchd 排程皆在此機器)。
每次 session 開始先確認 `pwd` 與機器是否相符,不符則停止並提醒 Jun。

## 已確認目標(Phase 0,2026-07-08 拍板,依 trash-pseo-spec.md §11.5)

- **解決誰的問題**:全台民眾搜尋「〔地名〕垃圾車時間」時,官方查詢介面體驗差(環境部全國查詢網為老式下拉選單、部分縣市僅以 PDF 公告),此站用 pSEO(縣市 × 行政區 × 清運點)頁面承接長尾搜尋流量。
- **變現模式**:AdSense 展示廣告,月自然流量 > 1,000 sessions 後申請;後期可選各行政區頁面掛在地生活服務聯盟(垃圾代倒、居家清潔服務導購)。
- **任務分級**:L2(功能開發等級的驗收流程),但依規模比照新產品管理,本文件即視為 kickoff 產出。

### 成功指標(分階段檢查)

| 時間點 | 指標 | 性質 |
|---|---|---|
| 第 8-12 週 | GSC 索引率 ≥ 80% 提交頁數 | 領先指標,非放棄點 |
| 第 3 個月 | 月自然流量 ≥ 1,000 sessions | 達標即申請 AdSense |
| 第 6 個月 | 月自然流量 ≥ 1,000 且呈成長趨勢,或已有 AdSense 收益 | 判斷是否值得繼續投入 |

### 放棄條件(兩階段)

1. **第 8-12 週檢查點(不放棄,觸發診斷)**:若 GSC 已索引頁面 < 提交 sitemap 頁數的 50%,或近 4 週總曝光次數 < 5,000 次/月 → 判定為技術面或內容面問題,依序檢查:GSC 涵蓋範圍報告是否有錯誤、pSEO 頁面是否被判定過度相似(需加強內容差異化)、sitemap 是否正確送達與更新。
2. **第 6 個月硬性放棄點**:月自然流量 < 500 sessions,且近 2 個月呈持平或下滑(無成長趨勢),或 AdSense 申請被拒且反覆調整後仍無法通過 → 停止每日 launchd 排程、轉為靜態封存(頁面保留在線但不再更新資料、不再投入開發時間),記錄於本專案 DECISIONS.md 作結案。

> 任何實作決策與本目標衝突時,以目標為準。放棄條件是硬性的,到期必須依上表執行判斷,不得因「還想再試試」而無限延後。

## 技術棧

| 層 | 技術 | 說明 |
|---|---|---|
| 資料層 | Python 3.12(Homebrew,`.venv`)+ httpx + pandas | 抓取與正規化清運點資料 |
| 頁面層 | Astro(靜態輸出) | getStaticPaths 批量生成頁面 |
| 部署 | Cloudflare Pages(wrangler CLI) | 免費、全球 CDN |
| 排程 | macOS launchd | 每日 06:00 執行完整 pipeline |
| 通知 | Telegram Bot(`scripts/notify.py`) | 成功/失敗皆通知 |
| 分析 | Cloudflare Web Analytics + Google Search Console | 免費 |

完整技術規格、資料來源、Schema、頁面規格見 `trash-pseo-spec.md`(建構期間視為唯一真實來源,不重複貼於此)。

## 建構階段與目前進度

- [x] **Phase 0**:repo、CLAUDE.md、目錄骨架、.env 樣板、Telegram 通知模組
- [ ] **Phase 1**:fetch.py 只做高雄市 + normalize + validate 全流程跑通
- [ ] **Phase 2**:Astro 站台 + 高雄市全部頁面生成,本地 preview 驗收
- [ ] **Phase 3**:手動部署 Cloudflare Pages 一次
- [ ] **Phase 4**:擴充至六都 → 驗收 → 全台 22 縣市
- [ ] **Phase 5**:daily.sh + launchd plist、log rotation、斷網重試
- [ ] **Phase 6**:提交 GSC + sitemap、部署 Cloudflare Web Analytics

每個 Phase 完成後停下等待 Jun 驗收,不跳著做。

## 鐵律(本專案專屬,寫入自 spec §13)

1. 驗證失敗絕不部署(L1/L2/L3 見 `trash-pseo-spec.md` §7)
2. 絕不填假資料、絕不用 LLM 憑空生成清運時間
3. 抓取一律節流(每請求間隔 ≥ 2 秒),User-Agent 標明專案名稱與聯絡方式
4. 每頁必有:獨特 title/description、JSON-LD、資料來源標註
5. 任何腳本失敗必發 Telegram 通知

## MVP 範圍(Phase 0-3)

- 高雄市單一縣市完整跑通:抓取 → 正規化 → 驗證 → Astro 頁面 → 手動部署一次
- Telegram 通知模組先行建好,後續 Phase 皆可呼叫

## Deferred(明確不做,待對應 Phase 再議)

- 座標補全(geocode.py)為 Phase 2 可選項,非必要
- 六都/全台擴充在 Phase 4 才處理
- launchd 自動排程、斷網重試在 Phase 5 才處理
- GSC/sitemap 提交、Web Analytics 在 Phase 6 才處理
- 在地生活服務聯盟導購(第二階段變現)完全不在本次範圍

## 已知問題

(隨開發更新)

## 本專案專屬規則

- 系統 `python3` 為 3.9.6,不符 spec 要求的 3.12;已透過 `brew install python@3.12` 安裝,專案虛擬環境固定用 `/opt/homebrew/bin/python3.12 -m venv .venv`。
- `data/normalized/` 底下的 JSON **需要 git 追蹤**(spec §5 明定),不可被 .gitignore 排除。
