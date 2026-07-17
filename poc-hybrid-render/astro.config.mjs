// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Phase 4.5 Phase 1 PoC:單一縣市(高雄)的清運點頁改 on-demand server render。
// 其餘頁面(若有)維持預設靜態(hybrid),驗證 @astrojs/cloudflare adapter 可行性。
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: {
      enabled: true,
    },
  }),
});
