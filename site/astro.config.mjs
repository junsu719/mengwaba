// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// site 為 Phase 2 本地開發用佔位值;Phase 3 建立 Cloudflare Pages 專案、
// 取得實際網域後必須更新(鐵律4:未申請的 domain 不得寫入程式)。
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  integrations: [
    sitemap({
      entryLimit: 10000,
    }),
  ],
});
