import type { CollectionPoint } from './data';

// 僅供仍為靜態預生成的頁面/端點使用:工具首頁 /trash/、縣市索引頁 /trash/{city}/、
// 兩個 search-index.json 端點。行政區頁與清運點頁已改 on-demand D1 查詢(見 ./data-d1.ts),
// 不會 import 這個檔案,故此處把整份縣市 JSON 用 import.meta.glob 在 build 時內嵌成模組資料,
// 不會拖累部署後的 Worker 大小(prerender 專用的 chunk 不會被打進 on-demand 路由的執行路徑)。
//
// 為什麼不能像過去一樣用 fs.readFileSync(見舊版 data.ts 的 DATA_ROOT):
// @astrojs/cloudflare adapter 的 prerender 階段是在 workerd 沙箱裡執行已打包的 chunk,
// 實測連絕對路徑的 host 檔案系統都讀不到(非僅 process.cwd() 問題),必須改成 build 時
// 就把資料內嵌進 bundle,而非執行期才去讀檔案。
const cityDataModules = import.meta.glob<{ default: unknown[] }>('../../../data/normalized/*.json', {
  eager: true,
});

const _cache = new Map<string, CollectionPoint[]>();

/** 讀取指定縣市的正規化資料,僅保留 L1 必填欄位(district/point_name/schedule)齊全、可發佈成頁面的清運點。 */
export function loadCityPoints(citySlugFile: string): CollectionPoint[] {
  if (_cache.has(citySlugFile)) return _cache.get(citySlugFile)!;
  const entry = Object.entries(cityDataModules).find(([modulePath]) =>
    modulePath.endsWith(`/${citySlugFile}.json`)
  );
  if (!entry) throw new Error(`找不到縣市資料檔案: ${citySlugFile}.json`);
  const all = entry[1].default as CollectionPoint[];
  const publishable = all.filter((p) => p.district && p.point_name && p.schedule.length > 0);
  _cache.set(citySlugFile, publishable);
  return publishable;
}
