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
        // 規格 6、12：判定快取與忽略清單存在 chrome.storage.local。
        // offscreen：圖片文字辨識在離屏頁執行（docs/risk-rules.md 第 7 節）。兩者安裝時都不會跳警告。
        permissions: ['storage', 'offscreen'],
        background: {
          service_worker: 'src/background/main.ts',
          type: 'module',
        },
        // 預設政策會停用 WebAssembly；加上 wasm-unsafe-eval 是 Chrome 允許的最低政策，Tesseract 需要。
        content_security_policy: {
          extension_pages:
            "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
        },
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
  // 離屏頁不在 manifest 裡，要另外列為入口才會打包。
  build: { rollupOptions: { input: { offscreen: 'offscreen.html' } } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
