# trash-pseo — 專案規範

## 開發環境(雙機)

可在 **Mac mini M4**(`~/projects/trash-pseo`)或 **PC WSL2**(`~/projects/mengwaba`)開發,程式碼以 GitHub(`junsu719/mengwaba`)同步。每次 session 開始先 `git pull` 確保為最新版,結束前 `git push`。

## 執行環境(部署與排程分開對待,2026-07-16 調整)

- **手動部署**(`wrangler pages deploy`):PC WSL2、Mac mini M4 皆可執行。部署前務必先 `git pull` 確保為最新版,避免用舊碼覆蓋新碼。Cloudflare Pages 部署結果與來源機器無關,不需限制單一機器。
- **自動排程**(pipeline 每日 launchd):**唯一限 Mac mini M4**。PC 不得設定任何自動排程,避免雙機自動化同時跑 pipeline,造成資料互相覆蓋或 git 衝突。

每次 session 開始先確認 `pwd` 與當前機器,依機器角色行事。

## 站群品牌(2026-07-13 解凍拍板)

本專案原為獨立網站,現已解凍併入新的站群品牌「**悶蛙吧 MengWaBa**」(正式網域 `mengwaba.com`,已註冊持有)。策略改為「單一 domain + 子目錄」的工具站群:垃圾車主題(本專案)負責開疆(市場空缺大、好收錄),之後陸續加入勞動權益計算機等高 RPM 主題,共享同一 domain 的 SEO 信任。

- **URL 結構**:垃圾車查詢從網站根目錄改掛到 `/trash/` 子目錄(`/trash/{city}/{district}/{point}`);網站根目錄 `/` 改為品牌著陸頁,列出目前提供的工具並預留未來工具位置。
- **既有的放棄條件、成功指標、鐵律不受影響**,僅網域與 URL 結構改變;詳見 DECISIONS.md 2026-07-13 條目。

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
- [x] **Phase 1**:fetch.py 只做高雄市 + normalize + validate 全流程跑通(2026-07-09 Jun 驗收通過,人工核對真實清運時間無誤)
- [x] **Phase 2**:Astro 站台 + 高雄市全部頁面生成(18,842 頁),Lighthouse 驗收 4 種代表頁(首頁/縣市頁/行政區頁/清運點頁)Performance/Accessibility/Best Practices/SEO 皆 100 分(2026-07-10 Jun 驗收通過)
- [~] **Phase 3a**(技術驗證,已完成):部署至 Cloudflare Pages `trash-pseo.pages.dev`,線上 4 種代表頁 Lighthouse 重測與本地一致皆 100 分,內部連結/sitemap/robots.txt 動態端點皆正確指向線上絕對網址。**尚未**:綁自訂網域、提交 GSC(依 2026-07-10 拍板延後至 Phase 3b),待 Jun 驗收線上版本
- [x] **站群改造**(2026-07-13,Jun 驗收通過):併入「悶蛙吧」品牌,站台改為 `/trash/` 子目錄架構 + 品牌首頁,`SITE_URL` 改為 `https://mengwaba.com`,sitemap/robots.txt/內部連結/JSON-LD 皆已更新並本地 build 驗證正確
- [x] **即時搜尋功能**(2026-07-13,Jun 手機驗收通過):`/trash/` 與 `/trash/{city}/` 頁面新增純前端搜尋框,build 時產生精簡搜尋索引(字典編碼,960KB/city,不含冗餘 address 欄位),前端 lazy-load(首次輸入才 fetch,不影響首屏)
- [x] **部署**(2026-07-13):`wrangler pages deploy` 上線,線上 5 種代表頁 Lighthouse 四項皆 100 分、sitemap/robots.txt/搜尋索引皆驗證正確
- [~] **Phase 3b**:Cloudflare Pages 已送出 `mengwaba.com` 網域綁定請求,但卡在 DNS 端——**待 Jun 手動處理**:登入 Cloudflare Dashboard → mengwaba.com 這個 zone → DNS → 新增 CNAME 記錄(名稱 `@`、目標 `trash-pseo.pages.dev`、Proxied),原因是目前 wrangler 的 OAuth token 只有 zone 讀取權限,無法用程式自動建立 DNS 記錄。CNAME 建好後 Cloudflare 會自動驗證簽發憑證,才算正式開始養站計時
- [ ] GSC 提交:待 Jun 確認網域正式綁定上線後再進行(Jun 指示)
- [~] **Phase 4**(擴充至六都 → 全台 22 縣市):**臺中市已完成**——資料層(fetch/normalize/validate 重構為多縣市可傳參版本)、Astro 頁面生成(19,973 頁,沿街收運/資源回收時刻/麵包屑皆處理)、`CITIES` 註冊表重構(`site/src/lib/data.ts`,新增縣市只需註冊一筆)三者皆完成並本地驗證,待部署上線(2026-07-16)。**下一步**:臺南市等其餘五都,依序擴充後再全台 22 縣市
- [ ] **Phase 5**:daily.sh + launchd plist、log rotation、斷網重試
- [ ] **Phase 6**:提交 GSC + sitemap、部署 Cloudflare Web Analytics

每個 Phase 完成後停下等待 Jun 驗收,不跳著做。

## 鐵律(本專案專屬,寫入自 spec §13)

1. 驗證失敗絕不部署(L1/L2/L3 見 `trash-pseo-spec.md` §7)
2. 絕不填假資料、絕不用 LLM 憑空生成清運時間
3. 抓取一律節流(每請求間隔 ≥ 2 秒),User-Agent 標明專案名稱與聯絡方式
4. 每頁必有:獨特 title/description、JSON-LD、資料來源標註
5. 任何腳本失敗必發 Telegram 通知
6. 座標落在台灣範圍外(§7 L2 判定,21.5-25.5N、119.5-122.5E 之外)的清運點,資料層維持原值不竄改,但頁面層不得輸出該點的 geo 座標相關 JSON-LD(如 GeoCoordinates),只顯示地址文字,避免錯誤地理標記傷害 SEO(2026-07-09 Jun 拍板,見 DECISIONS.md)

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

- 高雄市正規化資料中有 109 筆(0.62%)座標落在台灣範圍外(L2 檢出但未達 5% 中止門檻,如實保留原值)。頁面層規則見鐵律 6。
- `~/.npm/_cacache` 內有 root 擁有的殘留檔案(非本專案造成,推測是之前某次 sudo npm 操作留下的),導致一般權限的 `npm install`/`npx` 會報 EACCES。Phase 2 開發時繞過方式:用 `npm install --cache <暫存路徑>` 指定暫時快取目錄。若要一勞永逸,可執行 `sudo chown -R $(whoami) ~/.npm`(需 Jun 手動執行或明確同意後才動,屬全域環境變更)。

## 本專案專屬規則

- 系統 `python3` 為 3.9.6,不符 spec 要求的 3.12;已透過 `brew install python@3.12` 安裝,專案虛擬環境固定用 `/opt/homebrew/bin/python3.12 -m venv .venv`。
- `data/normalized/` 底下的 JSON **需要 git 追蹤**(spec §5 明定),不可被 .gitignore 排除。
