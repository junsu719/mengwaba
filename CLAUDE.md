# trash-pseo — 專案規範

## 開發環境(雙機)

可在 **Mac mini M4**(`~/projects/trash-pseo`)或 **PC WSL2**(`~/projects/mengwaba`)開發,程式碼以 GitHub(`junsu719/mengwaba`)同步。每次 session 開始先 `git pull` 確保為最新版,結束前 `git push`。

## 執行環境(2026-07-17 更新:排程需求隨 Phase 4.5 D1 架構定案取消)

- **手動部署**(`wrangler pages deploy`):PC WSL2、Mac mini M4 皆可執行。部署前務必先 `git pull` 確保為最新版,避免用舊碼覆蓋新碼。Cloudflare Pages 部署結果與來源機器無關,不需限制單一機器。
- **資料更新**(fetch → normalize → validate → 推送 D1):改為**季度手動執行**(最多一季一次,甚至半年一次),PC WSL2、Mac mini M4 皆可執行,執行前同樣先 `git pull`。原本「排程僅限 Mac mini M4」的限制隨每日自動排程一併取消——手動、低頻、有人在場的操作不存在雙機自動化互相覆蓋的風險。
- **不再需要 Mac mini 24/7 開機**:D1 架構讓網站獨立跑在 Cloudflare 邊緣渲染,機器僅在季度推資料時短暫使用,推完即可關機。Mac mini 的 24/7 特性保留給未來「機器即產品」型專案(如本地 AI 推理),與本專案脫鉤。

每次 session 開始先確認 `pwd` 與當前機器。

## 資料更新與機器角色(Phase 4.5,2026-07-17 拍板)

垃圾車清運路線變動頻率極低,資料更新機制從最初設想的「Mac mini 24 小時每日自動排程」改為**季度手動執行**;資料存取改採 **Cloudflare D1**(取代原本打包進 Functions 的做法)。完整技術方案見 `phase4.5-hybrid-rendering-spec.md` 第 3、4 節,完整拍板理由見 DECISIONS.md 2026-07-17 條目。

- 若悶蛙吧未來出現需要中/高頻更新的題材,優先評估 Cloudflare Cron Triggers(抓取跑在 Workers、寫入 D1、不需本機開機),而非比照本專案設 launchd 排程;但 pSEO 題材本質是低頻長尾資料,預期極少遇到此情境。
- L1/L2/L3 驗證鐵律不變(驗證失敗絕不推送 D1);更新頻率越低越要靠驗證擋髒資料,不因低頻而放鬆把關。
- 原為 24/7 自動化設計的項目(launchd 每日排程、看門狗、斷網重試)已不再需要,改為 Phase 4.5 Phase 3 的手動更新腳本取代。

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
2. **第 6 個月硬性放棄點**:月自然流量 < 500 sessions,且近 2 個月呈持平或下滑(無成長趨勢),或 AdSense 申請被拒且反覆調整後仍無法通過 → 停止季度資料更新排程、轉為靜態封存(頁面保留在線但不再更新資料、不再投入開發時間),記錄於本專案 DECISIONS.md 作結案。

> 任何實作決策與本目標衝突時,以目標為準。放棄條件是硬性的,到期必須依上表執行判斷,不得因「還想再試試」而無限延後。

## 技術棧

| 層 | 技術 | 說明 |
|---|---|---|
| 資料層 | Python 3.12(Homebrew,`.venv`)+ httpx + pandas | 抓取與正規化清運點資料 |
| 頁面層 | Astro(hybrid:靜態預生成 + on-demand SSR) | Phase 4.5 改造中,詳見 `phase4.5-hybrid-rendering-spec.md` |
| 資料存取 | Cloudflare D1 | on-demand 頁面查詢用,取代原本每日全量 build 的做法(2026-07-17 拍板,見 DECISIONS.md) |
| 部署 | Cloudflare Pages(wrangler CLI) | 免費、全球 CDN |
| 資料更新頻率 | 季度手動執行(非每日自動) | 清運路線變動頻率極低,不再需要 launchd 排程,詳見 DECISIONS.md 2026-07-17 |
| 通知 | Telegram Bot(`scripts/notify.py`,選配) | 手動更新流程可選擇性使用,非每日排程下的必要安全網 |
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
- [ ] **Phase 5**:季度手動更新腳本 + D1 推送(不再需要 launchd plist、看門狗、斷網重試,2026-07-17 拍板取消 24/7 自動化前提,詳見 DECISIONS.md)
- [ ] **Phase 6**:提交 GSC + sitemap、部署 Cloudflare Web Analytics

每個 Phase 完成後停下等待 Jun 驗收,不跳著做。

## 鐵律(本專案專屬,寫入自 spec §13)

1. 驗證失敗絕不部署(L1/L2/L3 見 `trash-pseo-spec.md` §7)
2. 絕不填假資料、絕不用 LLM 憑空生成清運時間
3. 抓取一律節流(每請求間隔 ≥ 2 秒),User-Agent 標明專案名稱與聯絡方式
4. 每頁必有:獨特 title/description、JSON-LD、資料來源標註
5. 腳本失敗建議發 Telegram 通知(2026-07-17 起降級為選配,非強制鐵律——原為每日無人值守排程設計的安全網,改為季度手動執行後,執行者當下即可看到結果,不再是必要條件)
6. 座標落在台灣範圍外(§7 L2 判定,21.5-25.5N、119.5-122.5E 之外)的清運點,資料層維持原值不竄改,但頁面層不得輸出該點的 geo 座標相關 JSON-LD(如 GeoCoordinates),只顯示地址文字,避免錯誤地理標記傷害 SEO(2026-07-09 Jun 拍板,見 DECISIONS.md)
7. **任何影響 production(`mengwaba.com`)的部署動作,一律先向 Jun 說明並取得同意才執行**,不得在對話中途自行判斷「反正是既定計畫」就直接動手(2026-07-20 拍板,見 DECISIONS.md 2026-07-20 事故記錄)
8. **架構有變動(換 adapter、換部署方式、換資料存取層等)首次影響 production 前,必須先部署到非正式環境完成 curl 紅線驗證(HTML 內容、JSON-LD、狀態碼皆正確),確認無誤才切換正式網域**,不得把「新架構第一次上線」和「正式網域」同一步做掉(2026-07-20 拍板,起因見 DECISIONS.md 2026-07-20:D1 動態版第一次上線直接推 production,事後才發現 `@astrojs/cloudflare` v14 是 Workers-only adapter 與 Pages 保留的 `ASSETS` binding 硬衝突,導致正式網域一度回傳錯誤內容)。**「非正式環境」的定義見鐵律 9——`*.workers.dev` 基礎網址不算在內**,原本這裡寫的 `*.workers.dev` 是錯誤示範,已於 2026-07-27 修正。
9. **`trash-pseo.junsu578.workers.dev`(不含版本 ID 的基礎網址)與 `mengwaba.com` 共用同一個已部署的 Worker 版本,不是彼此隔離的環境**——對其中一個做的任何驗證,等同對另一個做,兩者會同時反映最新一次 `wrangler versions deploy` 切換到的版本。真正跟正式流量隔離、可以放心驗證新版本而不影響現有使用者的,是 `wrangler versions upload`(不是 `versions deploy`)產生的**版本專屬預覽網址**(格式 `https://<version-id>-trash-pseo.junsu578.workers.dev`,例如 `https://b0dcf3aa-trash-pseo.junsu578.workers.dev`)——每次上線前的驗證(含鐵律 8 要求的 curl 紅線驗證)一律用這種版本專屬網址,不得用不含版本 ID 的基礎網址當作「預覽」(2026-07-27 拍板,見 DECISIONS.md 2026-07-27 條目)
10. **任何改變 URL 結構或 ID 方案的變更,必須同時提出舊網址的處理方案(301 導向),並在上線前驗證**——已被搜尋引擎索引的網址是資產,不是可以任意汰換的內部識別碼。2026-07-22 point_id 從全域流水號改內容雜湊時,所有檢查都只放在「新資料能不能正確顯示」,沒有人問「已經被索引的舊網址怎麼辦」,導致已索引頁面全數 404、曝光與點擊歸零,直到 7/28 才發現並修復,累積損失約 27% 曝光(高雄無法挽回的部分,詳見 DECISIONS.md 2026-07-28 事故記錄)。這與鐵律 9 加上前的 `parsePointId` 教訓是同一類盲區:改變內部識別方案時只驗證了內部消費端,沒考慮外部既有引用(搜尋引擎索引、書籤、外部連結)。

## MVP 範圍(Phase 0-3)

- 高雄市單一縣市完整跑通:抓取 → 正規化 → 驗證 → Astro 頁面 → 手動部署一次
- Telegram 通知模組先行建好,後續 Phase 皆可呼叫

## Deferred(明確不做,待對應 Phase 再議)

- 座標補全(geocode.py)為 Phase 2 可選項,非必要
- 六都/全台擴充在 Phase 4 才處理
- 季度手動更新腳本 + D1 推送在 Phase 4.5 Phase 3 才處理(2026-07-17 拍板取消原本 Phase 5 的 launchd 自動排程、斷網重試,不再適用 24/7 自動化前提)
- GSC/sitemap 提交、Web Analytics 在 Phase 6 才處理
- 在地生活服務聯盟導購(第二階段變現)完全不在本次範圍

## 已知問題

- 高雄市正規化資料中有 109 筆(0.62%)座標落在台灣範圍外(L2 檢出但未達 5% 中止門檻,如實保留原值)。頁面層規則見鐵律 6。
- `~/.npm/_cacache` 內有 root 擁有的殘留檔案(非本專案造成,推測是之前某次 sudo npm 操作留下的),導致一般權限的 `npm install`/`npx` 會報 EACCES。Phase 2 開發時繞過方式:用 `npm install --cache <暫存路徑>` 指定暫時快取目錄。若要一勞永逸,可執行 `sudo chown -R $(whoami) ~/.npm`(需 Jun 手動執行或明確同意後才動,屬全域環境變更)。
- **repo 根目錄的 `.env` 會讓 `wrangler` 誤用錯的 token**:根目錄 `.env` 裡的 `CLOUDFLARE_API_TOKEN` 是 DNS 切換用的 `mengwaba-dns-cutover` token(無 D1 權限),wrangler 在有 `.env` 的目錄下執行會自動讀取並優先於 OAuth 登入,導致 `wrangler d1` 相關指令在根目錄執行會報 403/10000 認證錯誤(2026-07-27 排查,見 DECISIONS.md)。`site/` 目錄下沒有 `.env`,一律在 `site/` 目錄執行 `wrangler d1`/`wrangler versions`/`wrangler deployments` 等指令;保險起見可加 `env -u CLOUDFLARE_API_TOKEN` 前綴強制略過該變數。

## 本專案專屬規則

- 系統 `python3` 為 3.9.6,不符 spec 要求的 3.12;已透過 `brew install python@3.12` 安裝,專案虛擬環境固定用 `/opt/homebrew/bin/python3.12 -m venv .venv`。
- `data/normalized/` 底下的 JSON **需要 git 追蹤**(spec §5 明定),不可被 .gitignore 排除。
