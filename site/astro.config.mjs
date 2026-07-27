// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// 正式網域為 mengwaba.com(已註冊,2026-07-13 併入「悶蛙吧」站群品牌拍板)。
// 本地開發可用 SITE_URL=http://localhost:4321 覆寫。
//
// Phase 4.5 Step 4:output 維持 'static'(預設,首頁/工具首頁/縣市索引頁等大多數頁面仍預生成),
// 行政區頁與清運點頁改用逐頁 `export const prerender = false` 退出預生成、改 on-demand D1 查詢
// (見 phase4.5-hybrid-rendering-spec.md §3)。adapter 設定沿用 Phase 1 PoC 已驗證過的組態。
//
// session:@astrojs/cloudflare v14 預設會自動注入一個 SESSION KV binding 並在 wrangler deploy
// 時自動佈建(auto-provision)真實 KV namespace,但本站完全不使用 Astro.session。明確指定
// in-memory 的 lruCache driver 以關閉這個自動佈建行為,避免部署時意外建立不會用到的雲端資源
// (2026-07-21 Phase 4.5 Workers 遷移驗證時發現)。
export default defineConfig({
  site: process.env.SITE_URL || 'https://mengwaba.com',
  output: 'static',
  session: {
    driver: sessionDrivers.lruCache(),
  },
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: {
      enabled: true,
    },
  }),
  // @astrojs/sitemap 移除(S1,2026-07-27 拍板):該套件只能自動收錄 build 時預生成的靜態頁面,
  // 行政區頁/清運點頁改 on-demand D1 查詢後完全不在它的收錄範圍內。改由 sitemap-index.xml.ts、
  // sitemap-static.xml.ts、sitemap-[city].xml.ts 三支端點手動接手、依城市拆分,詳見各檔案註解與
  // DECISIONS.md 2026-07-27 條目。
});
