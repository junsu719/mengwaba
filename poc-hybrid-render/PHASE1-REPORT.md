# Phase 4.5 Phase 1 技術驗證報告

> PoC 位置:`poc-hybrid-render/`(獨立目錄)+ `phase4.5-poc-hybrid-rendering` 分支(獨立分支)。
> 全程未修改 `site/`(既有高雄主站)任何檔案,`git diff main -- site/` 為空。
> 未對真實 Cloudflare 帳號建立/操作任何 KV namespace 或 D1 database——所有測試皆用 `wrangler ... --local`,只在本機 `.wrangler/state/` 模擬,從未發出對 Cloudflare API 的請求。

## 0. PoC 範圍

- 資料:高雄市正規化資料(`data/normalized/kaohsiung.json`,18,805 筆可發佈清運點,36 個行政區)。
- 頁面模板:清運點頁(對應正式站 `/trash/{city}/{district}/{point}/`)。
- 技術:Astro 7 + `@astrojs/cloudflare` v14(最新版,現行版本直接產出 Cloudflare **Workers**,非舊式 Pages Functions——詳見 §5 附註)。
- 同一頁面模板做了 3 個資料存取版本以便同機比較:
  - `/trash/kaohsiung/{district}/{point}/`——**選項 A(打包)**,與正式站網址完全相同,是紅線驗證頁。
  - `/poc-kv/kaohsiung/{district}/{point}/`——**選項 B(KV)**,僅供本次 benchmark,非對外網址。
  - `/poc-d1/kaohsiung/{district}/{point}/`——**選項 C(D1)**,僅供本次 benchmark,非對外網址。

## 1. 紅線驗證:curl 是否看到完整 SEO 內容(§6 第一條)

三個版本皆用 `curl`(非瀏覽器)對 `wrangler dev`(本機真實 Workers runtime,非 Node 模擬)發請求,原始 HTML 內皆確認含:

| 內容 | A 打包 | B (KV) | C (D1) |
|---|---|---|---|
| 本週時刻表 `<table>` | ✅ | ✅ | ✅ |
| 地址參考文字 | ✅ | ✅ | ✅ |
| 常見問題(FAQ 文字,非 JS 產生) | ✅ | ✅ | ✅ |
| JSON-LD(Breadcrumb + FAQPage + Place/GeoCoordinates)共 3 段 | ✅ | ✅ | ✅ |
| `<title>`/`<meta description>` | ✅ | ✅ | ✅ |

**結論:三個資料存取方案的 on-demand render 皆通過紅線——HTML 是伺服器端組好的完整內容,不是空殼 + client fetch。** 改造方向本身可行,不因選哪個資料層而有 SEO 風險差異。

## 2. 部署檔案數(§6 第三條)

`astro build` 產出的 `dist/`:**22 個檔案**,總大小 11MB(其中 10MB 是選項 A 打包進去的 JSON)。相較於現行全靜態 38,857 個 HTML 檔案(已撞 Cloudflare Pages 20,000 上限),on-demand 架構讓檔案數從數萬降到 22 個,徹底脫離天花板,**且與選哪個資料存取方案無關**——這條紅線只要改成 on-demand 就自動解決。

## 3. TTFB 實測(本機 `wrangler dev`,真實 Workers runtime,非 `astro dev` 的簡化模式)

warm(isolate 已熱,連續請求平均):

| 行政區規模 | A 打包 | B (KV) | C (D1) |
|---|---|---|---|
| 楠梓區(1,160 點) | 4.7ms | 9.1ms | 18.9ms |
| 鳳山區(2,762 點,全市最大區) | 5.2ms | 14.8ms | 31.4ms |

**觀察**:
- A 打包幾乎不隨行政區大小變化(記憶體內查找,分組結果有模組層級快取)。
- B/C 都隨行政區點數線性變慗,因為每次 request 都要重新讀取/查詢「整個行政區」的資料(供鄰近清運點與分組使用)。D1 比 KV 慢,推測是 SQL 查詢+多欄位反序列化的固定成本比 KV 單一 JSON blob 反序列化高。
- 三者皆遠低於使用者可感知門檻(<50ms),就使用者體驗而言差異不顯著;但差異會反映在 Workers CPU 時間帳單與免費額度消耗速度上。

冷啟動(isolate 重啟後的模組初始化成本,見 §4 說明為何用這個指標而非重啟 `wrangler dev` 计时):

| 方案 | 每次 cold isolate 需付出的額外成本 |
|---|---|
| A 打包 | **~217ms**(僅解析高雄一縣市 10.4MB JSON 模組,發生在 isolate 啟動時,不算進單次請求 CPU 時間,但佔用 1 秒的 startup time 上限) |
| B (KV) | ~0(資料不在模組內,無需在啟動時解析) |
| C (D1) | ~0(同上) |

## 4. 為何冷啟動用「模組初始化時間」而非重啟 wrangler dev 計時

實際 Cloudflare 邊緣的 isolate 冷啟動與本機 `wrangler dev` 重啟的行程開機時間(含 esbuild、Miniflare 初始化等)不是同一件事,後者會嚴重高估且充滿工具雜訊。真正會在「每次 cold isolate」重複發生、且會因選項而異的成本,是 **Worker 全域作用域(top-level code)的執行時間**——這正是 static import 一個 12MB JSON 檔案時,bundler 產生的模組在 `import` 當下就要整個解析。用 Node 直接 `import()` 該編譯後的 chunk 檔案量得 **217ms**,這個數字不含 wrangler/Miniflare 工具本身的啟動雜訊,是較乾淨的「這個方案在冷啟動多付出多少」估計。

Cloudflare 官方文件:Worker 的 top-level 程式碼有獨立的 **1 秒 startup time 上限**(與每請求 10ms CPU 時間上限是分開算的)。高雄一縣市已吃掉這個 1 秒預算的 ~22%。若選項 A 要擴大到多縣市**共用同一個 Worker bundle**(例如把六都全塞進一個 Functions),用同密度外推,大約 4-5 個高雄等級的縣市就會逼近 1 秒上限,同時也會先撞到 Workers script 大小上限(見 §5)。

## 5. Workers/KV/D1 官方限制(對照高雄實測數字)

| 項目 | 免費方案 | 付費方案($5/mo 起) | 高雄實測數字 | 意涵 |
|---|---|---|---|---|
| Worker script 大小(gzip) | 3 MB | 10 MB | 打包高雄一縣市 = **845 KB** gzip | 免費方案下,單一 Worker 打包全部資料大約只夠塞 3-4 個高雄等級的縣市,22 縣市全塞同一 Worker **不可行**(需拆多個 Worker/route,或改 KV/D1) |
| Worker 每請求 CPU 時間 | 10ms | 更高 | 本次頁面渲染邏輯(含 nearestPoints 計算)在 A 方案下影響不大,因為分組已快取;但 B/C 需注意 JSON.parse 大 blob 的 CPU 成本會計入每請求 10ms 額度 |
| KV 寫入 | **1,000 次/天** | 100 萬次/月 | 高雄一次全量更新(僅 district 層級 key)= 36 次寫入;若含逐點 key(供其他查詢模式用)= 18,841 次寫入 | **免費方案下,只要包含逐點 key 的每日全量更新,第一次跑就會超過每日 1,000 次寫入上限而失敗**。即使只用「行政區彙整 key」設計(36 次/縣市),22 縣市 = 792 次,單次還能勉強塞進免費額度,但沒有安全餘裕,且往後任何工具(勞動計算機等)一起用同帳號會共用這個每日額度 |
| KV 讀取 | 100,000 次/天 | 1000萬次/月 | 每頁 render 需 1 次讀取(行政區彙整 blob) | 免費額度換算約可撐 10 萬次/天的頁面瀏覽量,養站初期夠用 |
| D1 寫入(rows written) | **100,000 rows/天** | 5,000萬 rows/月 | 高雄全量更新(每日 pipeline 重新 upsert)= 18,805 rows | 免費額度可容納約 5 個高雄等級縣市的每日全量重寫,22 縣市全上線後需升級付費方案(成本極低:$1/百萬 rows) |
| D1 資料庫大小 | 500MB/DB(帳號總量 5GB) | 帳號總量含 5GB,超出 $0.75/GB-月 | 高雄一縣市本機 sqlite 檔案 = **8.0MB** | 外推 22 縣市 ≈ 176MB,**免費額度綽綽有餘**,完全不用擔心存儲上限 |
| 本機 bulk 更新耗時(高雄 18,805 筆) | — | — | KV bulk put ≈ **100 秒**;D1 SQL 匯入 ≈ **9 秒** | D1 匯入速度約為 KV 的 10 倍;此數字為本機測試,真實邊緣網路上的 remote 匯入會因為要打 API 而更慢,但相對差距預期方向一致 |

> 上述免費/付費額度數字取自 2026-07-17 查詢的 Cloudflare 官方文件(Workers/KV/D1 limits 與 pricing 頁),之後若 Cloudflare 調整方案請重新核對。

## 6. 三方案綜合比較

| 面向 | A. 打包進 Functions | B. KV | C. D1 |
|---|---|---|---|
| 實作複雜度 | **最低**——原本 `fs.readFileSync` 改成 `import` 即可,邏輯幾乎不用改 | 中——需重新設計 key 結構(point/district 兩層),需寫 bulk 匯入腳本 | 中——需設計 schema、寫 SQL 查詢,但查詢邏輯比手刻 KV key 慣例更直覺 |
| 每日 pipeline 更新資料 | **差**——資料變更等於整包程式碼要重新 build + deploy 一次 Worker,無法把「資料更新」和「程式碼部署」脫鉤,違背 spec §4 的目標 | 差(免費方案)/可(付費方案)——免費每日 1,000 次寫入上限太低,含逐點 key 必超標;只用行政區彙整 key 可壓在 22 縣市 792 次左右但沒有安全餘裕 | **好**——免費每日 10 萬 rows 寫入額度,高雄一縣市全量重寫僅 18,805 rows,可容納約 5 縣市;付費後幾乎無上限,且本機匯入實測速度是 KV 的 10 倍 |
| warm 讀取延遲 | **最快**(4.7-5.2ms,不隨資料量顯著增加) | 中(9-15ms,隨行政區大小線性增加) | 較慢(19-31ms,隨行政區大小線性增加,增幅比 KV 明顯) |
| 冷啟動成本 | **差**——單縣市 217ms 模組解析,多縣市共用一個 Worker 會逼近 1 秒 startup 上限 | **好**——與資料量無關,恆定低成本 | **好**——與資料量無關,恆定低成本 |
| Worker 打包大小上限 | **差**——免費 3MB gzip 只夠塞 3-4 縣市;22 縣市全部塞同一 Worker 在免費方案下不可行 | **好**——bundle 大小與資料量無關(本次 KV 路由 chunk 僅 ~2.5KB) | **好**——同上(本次 D1 路由 chunk 僅 ~3KB) |
| 儲存上限疑慮 | 不適用(資料就是程式碼的一部分) | 免費 1GB(用彙整 key 設計,22 縣市約 260-300MB,尚可) | 免費 500MB/DB、帳號 5GB(22 縣市約 176MB,非常寬裕) |
| 需要新 Cloudflare 資源 | 否 | 是(KV namespace) | 是(D1 database) |
| 快取失效(Phase 3 議題預告) | 每次 deploy 自然清空,無額外機制需求 | 需自行設計(KV 本身無內建版本失效機制,但可搭配短 TTL 或 cache tag) | 同左,但 D1 是關聯式資料,未來若要做「本次更新了哪些點」的差異比對邏輯,SQL 天生比 KV 好操作 |

## 7. 建議(僅供參考,定案由 Jun 決定)

- **選項 A(打包)不建議作為長期方案**:今天的目的正是解除「資料量成長就會撞牆」的問題,而 A 方案的 Worker 大小上限與 1 秒 startup 上限,意味著資料量成長(22 縣市 + 未來其他工具)遲早會撞上**同一種**天花板,只是換了一個更高的位置,不是真正解方。它唯一的優勢(實作最簡單、無需新資源)在技術驗證階段很有用,但不適合 Phase 3 的每日 pipeline 更新需求(資料變更 = 全站重新部署,違背改造初衷)。
- **D1 比 KV 更適合這個專案的每日更新需求**:决定性因素是寫入配額——KV 免費方案每日僅 1,000 次寫入,含逐點 key 的更新模式第一天就會失敗;D1 免費方案每日 10 萬 rows,足夠撐數個縣市的每日全量重寫,且本機測試匯入速度快 10 倍。KV 若要用於本專案,必須先升級 Workers 付費方案($5/mo)才能穩定運作,而 D1 在免費方案下就能撐到 22 縣市規模成長到一半左右。
- D1 讀取延遲(19-31ms)比 KV(9-15ms)高,但兩者都遠低於使用者可感知的門檻,這個差距在「資料每日更新的可行性」面前是次要考量。
- 若之後資料量或流量成長導致 D1 免費額度不夠,付費升級成本很低($1/百萬 rows 寫入),遠比「發現 Worker bundle 打包方案撞牆後要整個重新架構」便宜。

## 8. 尚未驗證、留給 Phase 2 確認的項目

- 本次 PoC 僅驗證「清運點頁」單一模板的 on-demand 化;首頁/縣市索引/行政區索引頁維持靜態(hybrid 邊界)的實際共存測試留待 Phase 2(Astro 官方文件的 per-page `prerender` 機制理論上支援,但今天沒有在同一個 build 內同時放靜態頁驗證)。
- 真實 Cloudflare 邊緣的 isolate 冷啟動數字(本報告的 217ms 是本機 Node `import()` 模組解析時間的代理指標,不是真實邊緣冷啟動的直接量測;需實際部署才能量測,今天依指示未進行任何會動到真實帳號的部署)。
- KV/D1 的邊緣快取失效策略(spec §4 已預告是 Phase 3 的專門議題)。
- 台中(2 萬筆)、以及多縣市同時上線後的規模化行為,今天僅測了高雄單一縣市。

## 附錄:如何重現

```bash
cd poc-hybrid-render
npm install
python3 scripts/gen_seed.py                 # 產生本機 KV bulk JSON + D1 seed SQL
npx wrangler kv bulk put .local-seed/kv-bulk.json --binding=POINTS_KV --local
npx wrangler d1 execute phase4-5-poc-local-only --local --file=.local-seed/d1-schema.sql
npx wrangler d1 execute phase4-5-poc-local-only --local --file=.local-seed/d1-seed.sql
npm run build
npx wrangler dev --config dist/server/wrangler.json --port 8788 --persist-to .wrangler/state
# 另開一個 terminal:
curl http://localhost:8788/trash/kaohsiung/nanzi/00001/
curl http://localhost:8788/poc-kv/kaohsiung/nanzi/00001/
curl http://localhost:8788/poc-d1/kaohsiung/nanzi/00001/
```
