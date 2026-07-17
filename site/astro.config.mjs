// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// 正式網域為 mengwaba.com(已註冊,2026-07-13 併入「悶蛙吧」站群品牌拍板)。
// 本地開發可用 SITE_URL=http://localhost:4321 覆寫。
//
// Phase 4.5 Step 4:output 維持 'static'(預設,首頁/工具首頁/縣市索引頁等大多數頁面仍預生成),
// 行政區頁與清運點頁改用逐頁 `export const prerender = false` 退出預生成、改 on-demand D1 查詢
// (見 phase4.5-hybrid-rendering-spec.md §3)。adapter 設定沿用 Phase 1 PoC 已驗證過的組態。
export default defineConfig({
  site: process.env.SITE_URL || 'https://mengwaba.com',
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    sitemap({
      entryLimit: 10000,
    }),
  ],
});
