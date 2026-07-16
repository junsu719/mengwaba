# Phase 4.5 規格書:靜態 → Hybrid On-Demand 渲染架構改造

> 本文件為 Claude Code 建構規格。目的:解除 Cloudflare Pages 20,000 檔案上限,讓悶蛙吧站群能無限擴充縣市與工具,同時完整保留 pSEO 的 SEO 資產。
> 執行前先完整閱讀,分階段執行,每階段停下等 Jun 驗收。

## 1. 為什麼要做這個改造(背景)

- 現況:全靜態輸出,每個清運點 = 一個獨立 HTML 檔。高雄 + 台中兩縣市已產生 38,857 個檔案。
- 撞牆:Cloudflare Pages 免費方案單次部署上限 20,000 檔案,台中部署失敗。
- 付費方案為何不是解法:
  - 付費上限 100,000,但社群大量回報(2026-02)`PAGES_WRANGLER_MAJOR_VERSION=4` 環境變數常失效、上限未實際解除,不可靠。
  - 即使 100,000 生效,全台 22 縣市預估超過 10 萬檔案,仍會再撞牆。
  - 悶蛙吧是**站群**:未來勞動計算機、電費查詢等工具都會加入,檔案數是所有工具加總,靜態架構遲早崩潰。
- 結論:必須從「build 時全量靜態生成」改為「請求時即時渲染」,這是站群長期擴充的前置條件,越早改成本越低。

## 2. 核心原則(不可違背)

1. **SEO 資產零損失**:每個清運點頁面仍是獨立、可被 Google 索引的實體 URL(如 `/trash/taichung/zhongqu/00001/`),請求進來時伺服器回傳完整、含內容的 HTML(非空殼 + client 端 fetch)。這點是紅線——若改造後變成 SPA / client 端渲染導致 SEO 內容消失,則整個改造失敗。
2. **URL 結構完全不變**:所有既有網址維持原樣,不可改變路徑格式,避免已提交的頁面失效。
3. **Lighthouse 維持**:改造後代表頁面四項仍需接近 100(on-demand 渲染的 TTFB 會略增,但可接受;不得因架構改動引入 render-blocking 資源)。
4. **dist 檔案數大幅下降**:目標將部署檔案數從數萬降到數十(僅少量靜態資源 + Functions),徹底脫離檔案數天花板。

## 3. 技術方向(需 Phase 1 驗證後定案)

主要候選:**Astro 的 on-demand rendering(SSR 模式)+ Cloudflare Pages Functions/Workers adapter**。

- 使用 `@astrojs/cloudflare` adapter,將原本 `output: 'static'` 改為 `output: 'server'` 或 `output: 'hybrid'`。
- **hybrid 模式**(建議先評估):低量、變動少的頁面(首頁、品牌頁、縣市索引頁)維持靜態預生成;高量的清運點頁面(數萬頁那批)改為 on-demand server render。這樣兼顧「首頁快」與「清運點頁不佔檔案數」。
- 資料存取:清運點資料如何在 render 時被讀取需評估——
  - 選項 A:資料 JSON 隨 Functions 打包(資料量不大時可行,注意 Workers 有大小限制)。
  - 選項 B:資料放 Cloudflare KV 或 D1,render 時查詢(資料量大、或要支援每日更新時較合適)。
  - 選項 C:資料放 R2,render 時讀取。
  - **Phase 1 需 benchmark 三者的冷啟動延遲、實作複雜度、與每日 pipeline 更新資料的難易度,產出比較後由 Jun 定案。**

## 4. 對每日 pipeline 的影響(重要)

現況每日流程:fetch → normalize → validate → **astro build(全量靜態)** → deploy。

改造後,`astro build` 不再生成數萬 HTML,但資料更新機制要跟著改:

- 若資料走 KV/D1/R2:每日 pipeline 的最後一步從「build 全站」改為「將更新後的 normalized JSON 推送到 KV/D1/R2」,頁面於下次被請求時即反映新資料。
- 需確認:資料更新後,Cloudflare 邊緣快取如何失效(避免使用者看到舊資料),以及快取策略如何兼顧「SEO 要穩定 URL」與「資料每日更新」。
- validate 失敗絕不推送資料(鐵律不變),保留前一版資料。

## 5. 建構階段

- **Phase 1(技術驗證,不改主站)**:
  - 建一個最小 PoC:用 `@astrojs/cloudflare` adapter,把「單一縣市的清運點頁」改成 on-demand render,實測:
    - 頁面 render 出的 HTML 是否含完整 SEO 內容(用 curl 檢查,非瀏覽器)
    - 冷啟動 / 熱請求的 TTFB
    - 資料存取三選項(打包 / KV / D1)的比較
  - 產出比較報告,Jun 定案資料存取方式與 hybrid 邊界後才進 Phase 2。
- **Phase 2(改造頁面層)**:依定案方案,將清運點頁改為 on-demand;首頁/縣市索引等維持靜態(hybrid)。本地驗證 SEO 內容、URL、Lighthouse。
- **Phase 3(改造資料層與 pipeline)**:資料改推送到 KV/D1/R2;每日 pipeline 最後一步改為資料推送而非全量 build;處理快取失效。
- **Phase 4(部署驗證)**:部署到 Cloudflare,確認 dist 檔案數已降到數十、台中頁面終於能上線、線上 SEO 內容正確(curl 驗證)、Lighthouse 達標。
- **Phase 5(擴充驗證)**:此時再加第三個縣市(台南),驗證新縣市上線不再受檔案數限制、流程順暢。這是驗收整個改造成功的最終試金石。

## 6. 驗收紅線(任一不過即改造失敗)

- [ ] 清運點頁 curl 回傳的 HTML 含完整內容(時刻表、地址、FAQ、JSON-LD),非空殼
- [ ] 所有既有 URL 格式不變,舊網址仍可訪問
- [ ] 部署檔案數 < 100(脫離天花板)
- [ ] 台中頁面成功上線
- [ ] 代表頁 Lighthouse 四項接近 100
- [ ] 每日 pipeline 能更新資料且線上頁面正確反映、validate 失敗不推送

## 7. 風險與對策

| 風險 | 對策 |
|---|---|
| on-demand render 導致 SEO 內容消失 | Phase 1 就用 curl(非瀏覽器)驗證 HTML 含完整內容,這是紅線,不過不繼續 |
| 冷啟動延遲影響使用者/爬蟲 | hybrid 模式讓高流量入口頁靜態化;清運點頁雖 on-demand 但單頁輕量,render 快 |
| Workers 免費額度(10 萬請求/日)不足 | 養站期流量極低,遠不及額度;超過時已是高流量的幸福煩惱,屆時評估付費 |
| 資料每日更新與邊緣快取衝突 | Phase 3 專門處理快取失效策略;可用 cache tag 或短 TTL |
| 改造中弄壞高雄既有線上版 | 全程在分支或 PoC 進行,主線上版本改造完整驗證前不動 |

## 8. 完成後的長期收益

- 站群可無限擴充:全台 22 縣市 + 未來所有工具(勞動計算機、電費查詢等)都不再受檔案數限制。
- 這是一次性投資:改好之後,新增縣市/工具的邊際成本回到單純的「加資料 + 加模板」,不再需要擔心部署天花板。
