import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    crx({
      manifest: {
        manifest_version: 3,
        name: 'ScamLens',
        version: '0.0.1',
        action: { default_popup: 'index.html' },
        // 規格 8：最小權限，不使用 <all_urls>；第一版先做 Threads。
        content_scripts: [
          {
            matches: ['https://www.threads.com/*'],
            js: ['src/content/main.ts'],
          },
        ],
      },
    }),
    {
      name: 'vue-spec-plugin',
      enforce: 'pre',
      transform: (_code, id) => {
        if (/\.vue\?vue&type=spec(?:&|$)/.test(id)) {
          return { code: 'export default {};', map: null };
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
