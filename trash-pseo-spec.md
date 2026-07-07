# 專案規格書:全台垃圾車清運點查詢 pSEO 網站

> 本文件為 Claude Code 建構規格。請先完整閱讀本文件,再依「建構階段」順序分階段實作,每階段完成後停下等待驗收。

## 1. 專案目標

建立一個涵蓋全台灣的垃圾車清運點/清運時間查詢靜態網站,透過 programmatic SEO 大量生成「縣市 × 行政區 × 清運點」層級的頁面,吃下「〔地名〕垃圾車 時間」類長尾搜尋流量,以 AdSense 展示廣告變現。全站於 Mac mini M4 上以 launchd 排程每日自動更新與部署,無人值守。

## 2. 市場依據(選題理由,實作時不需處理)

- 官方供給體驗差:環境部全國查詢網為老式下拉選單介面,無 SEO;部分縣市(如台南)僅以 PDF 公告路線
- 官方 App「清運e點通」僅覆蓋少數縣市,全國缺口大
- 搜尋意圖強且在地化,每個行政區/清運點都是天然的獨立頁面
- 無強勢商業競爭者佔據此關鍵字群

## 3. 技術架構

| 層 | 技術 | 說明 |
|---|---|---|
| 資料層 | Python 3.12 + httpx + pandas | 抓取與正規化清運點資料 |
| 頁面層 | Astro(靜態輸出)| getStaticPaths 批量生成頁面 |
| 部署 | Cloudflare Pages(wrangler CLI)| 免費、全球 CDN |
| 排程 | macOS launchd | 每日 06:00 執行完整 pipeline |
| 通知 | Telegram Bot | 成功/失敗皆通知 |
| 分析 | Cloudflare Web Analytics + Google Search Console | 免費 |

## 4. 資料來源(依優先序)

1. **政府資料開放平臺「垃圾車清運點資訊」資料集**(data.gov.tw/dataset/25888)— 優先使用,注意各縣市欄位格式不一致,需正規化
2. **環境部環境管理署全國垃圾車清運路線查詢網**(hwms.moenv.gov.tw)— 補充來源,結構化 aspx 頁面,可解析;抓取需節流(每請求間隔 ≥ 2 秒),尊重 robots.txt
3. **各縣市開放資料平台**(data.taipei 等)— 針對六都做資料品質強化

授權注意:政府資料開放授權條款第 1 版允許商業利用,每頁 footer 需標註資料來源與授權。

## 5. 目錄結構

```
trash-pseo/
├── CLAUDE.md                  # 本規格的精簡版 + 鐵律
├── pipeline/
│   ├── fetch.py               # 各來源抓取器(每來源一個 class)
│   ├── normalize.py           # 欄位正規化 → 統一 schema
│   ├── validate.py            # 三層驗證(見 §7)
│   ├── geocode.py             # 清運點座標補全(可選,Phase 2)
│   └── requirements.txt
├── data/
│   ├── normalized/            # 正規化後 JSON,git 追蹤
│   │   └── {縣市代碼}.json
│   └── meta.json              # 各縣市筆數、更新時間戳
├── site/                      # Astro 專案
│   ├── src/pages/
│   │   ├── index.astro                    # 首頁:全台地圖式索引
│   │   ├── [city]/index.astro             # 縣市頁:行政區列表
│   │   ├── [city]/[district]/index.astro  # 行政區頁:清運點列表+時刻總表
│   │   └── [city]/[district]/[point].astro # 清運點頁(核心 pSEO 頁)
│   ├── src/components/
│   └── src/layouts/
├── scripts/
│   ├── daily.sh               # fetch → normalize → validate → build → deploy
│   └── notify.py              # Telegram 通知
├── logs/
└── .env                       # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID(.gitignore)
```

## 6. 統一資料 Schema

```json
{
  "point_id": "TPE-DAAN-0042",
  "city": "臺北市",
  "district": "大安區",
  "village": "群英里",
  "point_name": "和平東路二段96巷口",
  "address": "臺北市大安區和平東路二段96巷",
  "lat": 25.02345,
  "lng": 121.54321,
  "schedule": [
    {"weekday": [1,2,4,5,6], "arrive": "19:35", "depart": "19:40"}
  ],
  "collection_type": "定點清運",
  "notes": "週三、週日不收運",
  "source": "data.gov.tw/dataset/25888",
  "fetched_at": "2026-07-07T06:00:00+08:00"
}
```

正規化規則:
- 縣市名統一用「臺」字(臺北市),URL slug 用拼音(taipei)
- 時間統一 24 小時制 HH:MM
- weekday 用 ISO(1=週一…7=週日)
- 缺漏欄位保留 null,不得填假值

## 7. 資料驗證(validate.py,失敗即中止,絕不部署)

- **L1 結構驗證**:必填欄位(city/district/point_name/schedule)完整率 ≥ 95%
- **L2 合理性驗證**:時間格式合法、weekday ∈ 1-7、座標落在台灣範圍(21.5-25.5N, 119.5-122.5E)
- **L3 差異驗證**:與前一日相比,任一縣市筆數變動 > 30% 即視為來源異常,中止並通知
- 驗證失敗:exit code 非 0 → daily.sh 中止 → 保留前一日已部署版本 → Telegram 告警

## 8. 頁面規格(SEO 核心)

### 清運點頁(最重要的 pSEO 頁)
- URL:`/{city-slug}/{district-slug}/{point-slug}/`
- title:`{清運點名稱}垃圾車時間|{縣市}{行政區}清運時刻查詢`
- H1 含清運點名稱,首屏直接給答案:今天(依 build 日期計算)會不會來、幾點來
- 內容區塊:本週時刻表(表格)、清運方式、鄰近 5 個清運點(內部連結)、該行政區注意事項、FAQ 區塊(3-4 題:錯過怎麼辦/回收車時間/大型垃圾如何處理)
- JSON-LD:FAQPage + BreadcrumbList
- 每頁需有差異化文字(依資料動態組句),嚴禁全站同一句模板換變數

### 行政區頁
- 該區所有清運點列表 + 依時段分組的總表,是承接「{行政區}垃圾車」搜尋的頁面

### 全站要求
- sitemap.xml 自動生成、分片(每檔 ≤ 10,000 URL)
- 零前端框架,純 Astro + CSS,目標 Lighthouse 100/100/100/100
- RWD 行動優先(此類搜尋 90% 來自手機)
- footer 標註政府資料開放授權

## 9. 建構階段(Claude Code 依序執行,每階段驗收)

- **Phase 0**:建 repo、CLAUDE.md、目錄骨架、.env 樣板、Telegram 通知模組(先做,後續全部階段可用)
- **Phase 1**:fetch.py 只做「高雄市」單一縣市(開發者所在地,方便人工驗證)+ normalize + validate 全流程跑通
- **Phase 2**:Astro 站台 + 高雄市全部頁面生成,本地 preview 驗收頁面品質與 Lighthouse
- **Phase 3**:手動部署 Cloudflare Pages 一次,確認線上正常
- **Phase 4**:擴充 fetch 至六都 → 驗收 → 再擴充至全台 22 縣市
- **Phase 5**:daily.sh + launchd plist(每日 06:00)、log rotation、斷網重試(最多 3 次,間隔 10 分鐘)
- **Phase 6**:提交 Google Search Console + sitemap,部署 Cloudflare Web Analytics

## 10. 排程與維運

- launchd label:`com.trashpseo.daily`,RunAtLoad false,StartCalendarInterval 06:00
- 日誌:logs/daily-YYYYMMDD.log,保留 30 天
- Telegram 通知格式:`✅ 部署成功|22 縣市|41,235 清運點|新增 12 / 移除 3` 或 `❌ 失敗於 validate L3|臺中市筆數 -47%`

## 11. 變現路線圖

1. 上線第 0 週:提交 GSC,綁自訂網域(必買,AdSense 對 pages.dev 子網域審核通過率低)
2. 第 1-8 週:SEO 養站期,期間每週擴充內容頁(垃圾分類指南、大型垃圾預約教學等衛星文章,提升網站主題權威)
3. 月自然流量 > 1,000 後申請 AdSense
4. Phase 2 變現(可選):各行政區頁面掛在地生活服務聯盟(垃圾代倒、居家清潔服務導購)

## 11.5 成功指標與放棄條件(Jun 與 Claude Code 於 Phase 0 前確認,任務分級 L2)

**解決誰的問題**:全台民眾搜尋「〔地名〕垃圾車時間」時,官方查詢介面差,此站用 pSEO 頁面承接長尾搜尋流量。

**變現模式**:AdSense 展示廣告(月流量 > 1,000 後申請),後期可選在地生活服務聯盟導購。

**成功指標(分階段檢查)**:

| 時間點 | 指標 | 性質 |
|---|---|---|
| 第 8-12 週 | GSC 索引率 ≥ 80% 提交頁數 | 領先指標,非放棄點 |
| 第 3 個月 | 月自然流量 ≥ 1,000 sessions | 達標即申請 AdSense |
| 第 6 個月 | 月自然流量 ≥ 1,000 且呈成長趨勢,或已有 AdSense 收益 | 判斷是否值得繼續投入 |

**放棄條件(兩階段)**:

1. **第 8-12 週檢查點(不放棄,觸發診斷)**:若 GSC 已索引頁面 < 提交 sitemap 頁數的 50%,或近 4 週總曝光次數 < 5,000 次/月 → 判定為技術面或內容面問題,依序檢查:GSC 涵蓋範圍報告是否有錯誤、pSEO 頁面是否被判定過度相似(需加強內容差異化)、sitemap 是否正確送達與更新。

2. **第 6 個月硬性放棄點**:月自然流量 < 500 sessions,且近 2 個月呈持平或下滑(無成長趨勢),或 AdSense 申請被拒且反覆調整後仍無法通過 → 停止每日 launchd 排程、轉為靜態封存(頁面保留在線但不再更新資料、不再投入開發時間),記錄於專案 DECISIONS.md 作結案。

## 12. 風險與對策

| 風險 | 對策 |
|---|---|
| 資料來源改版/欄位變動 | L1-L3 驗證擋下 + 保留昨日版本,人工修 fetcher |
| 各縣市資料品質參差 | meta.json 記錄各縣市完整率,低於門檻的縣市頁面加「資料可能不完整」聲明 |
| Google 把此類查詢做成 OneBox | 靠 FAQ、鄰近點、衛星內容維持頁面附加價值 |
| 清運時間季節性調整 | 每日重抓即自動反映,頁面顯示「資料更新日期」建立信任 |

## 13. 鐵律(寫入 CLAUDE.md)

1. 驗證失敗絕不部署
2. 絕不填假資料、絕不用 LLM 憑空生成清運時間
3. 抓取一律節流,User-Agent 標明專案名稱與聯絡方式
4. 每頁必有:獨特 title/description、JSON-LD、資料來源標註
5. 任何腳本失敗必發 Telegram 通知
