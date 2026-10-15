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
        name: 'FraudSignal',
        version: '0.0.1',
        // 圖示原稿 public/icons/icon.svg；改了要重新輸出 PNG（128 四周留 16px 透明邊，Chrome 建議）。
        icons: {
          16: 'icons/icon-16.png',
          32: 'icons/icon-32.png',
          48: 'icons/icon-48.png',
          128: 'icons/icon-128.png',
        },
        action: {
          default_popup: 'src/popup/index.html',
          default_icon: {
            16: 'icons/icon-16.png',
            32: 'icons/icon-32.png',
          },
        },
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
        // 規格 8：最小權限，不使用 <all_urls>；支援 Threads 與 X。
        content_scripts: [
          {
            matches: ['https://www.threads.com/*', 'https://x.com/*'],
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
  // 擴充功能頁的網址沒有埠號，HMR 要明確指定，否則 WebSocket 會連到 localhost:（無埠號）。
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  // 離屏頁不在 manifest 裡，要另外列為入口才會打包。
  build: {
    rollupOptions: { input: { offscreen: 'src/offscreen/index.html' } },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
