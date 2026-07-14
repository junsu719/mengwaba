// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 正式網域為 mengwaba.com(已註冊,2026-07-13 併入「悶蛙吧」站群品牌拍板)。
// 本地開發可用 SITE_URL=http://localhost:4321 覆寫。
export default defineConfig({
  site: process.env.SITE_URL || 'https://mengwaba.com',
  integrations: [
    sitemap({
      entryLimit: 10000,
    }),
  ],
});
