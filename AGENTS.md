# ScamLens Agent Rules

本檔案適用於整個專案。規格書：`/Users/yan/Downloads/social_risk_extension_spec_v2.pdf`（社群可疑內容即時預警 Chrome Extension）。

## 擴充功能入口

- 使用 `@crxjs/vite-plugin`；manifest 寫在 `vite.config.ts` 的 `crx({ manifest })`，不另放 `manifest.json`。
- popup：`index.html` → `src/main.ts` → `src/App.vue`。
- 擴充功能圖示：原稿 `public/icons/icon.svg`（青→藍→靛漸層盾牌＋放大鏡＋驚嘆號，使用者選定），輸出成 `public/icons/icon-{16,32,48,128}.png`；manifest 的圖示只能用 PNG。改原稿後要重新輸出，128px 四周留 16px 透明邊（Chrome 建議）。
- content script：`src/content/main.ts`，只注入 `https://www.threads.com/*`。第一版先支援 Threads（使用者決定，規格書原為 Instagram 優先），IG 之後再加。偵測範圍為首頁動態與他人帳號頁（個人頁、單篇貼文含留言），比規格書第 14 節建議的「只限首頁」更廣，也是使用者決定。
- content script 的非 Vue 模組（平台 Adapter 等）放 `src/content/`，例如 `src/content/threadsAdapter.ts`。
- 單篇貼文頁上其他帳號的留言當主貼文的佐證（社群反應），規則見 `docs/risk-rules.md` 第 6 節；不爬取按讚者或留言者的個人頁。
- 圖片文字辨識（使用者決定，規格書沒有）：貼文照片用 Tesseract.js 在本機辨識，文字走同一套規則，細節見 `docs/risk-rules.md` 第 7 節。content script 不能開擴充功能的 worker，流程是 `src/content/imageText.ts` → 背景 `src/background/main.ts`（建立離屏頁、轉送）→ 離屏頁 `offscreen.html` → `src/offscreen/main.ts`。離屏頁不在 manifest 裡，在 `vite.config.ts` 的 `build.rollupOptions.input` 列為入口。需要 `offscreen` 權限與 CSP 的 `'wasm-unsafe-eval'`；語言檔 `public/tessdata/chi_tra.traineddata.gz` 檔名不能改。
- 帳號標示（使用者決定，規格書第 5 節原本要求有帳號層級證據才標示帳號）：貼文判定有風險時標示作者帳號，等級取該帳號已看到貼文的最高等級，記在 `src/content/accountRisks.ts`。
- 判定快取與忽略清單存在 chrome.storage.local（manifest 的 `storage` 權限），讀寫集中在 `src/content/riskStorage.ts`：只存有風險、或辨識過圖片文字的貼文判定（後者連同 `imageText`，避免重新辨識），鍵為 `result:<subjectKey>`；分析版本（`ENGINE_VERSION`）不同、超過 `expiresAt`（`RESULT_TTL_MS`，7 天）或超過 1000 筆時，在頁面載入時清除。使用者忽略的帳號記在 `ignoredAccounts`（帳號名稱）；以帳號為單位忽略是使用者決定，規格 US-03／第 7 節原為單篇貼文的 `ignoredPostKeys`。
- 標示位置是作者頭像右下角，貼文本身不加標示：`src/content/mountRiskAlert.ts` 在頭像外框建立 Shadow DOM，掛載 `src/views/risk-alert/RiskAlertView.vue`；子元件在 `src/components/risk-alert/`。
- 文案只陳述「此帳號發過可疑貼文」，不寫「此帳號是詐騙」（規格書第 5 節禁止文案）。
- 跨模組共用的資料契約（規格書第 7 節）放 `src/types/`，例如 `PostSnapshot` 在 `src/types/post.ts`。
- 測試放 `src/__tests__/`，路徑鏡像來源結構，例如 `src/__tests__/content/threadsAdapter.spec.ts`。
- 風險規則的研究、字詞清單與判定邏輯以 `docs/risk-rules.md` 為準；新增或調整規則時同步更新該文件與測試，並遞增 `ENGINE_VERSION`。
- `src/constants/blockedDomains.txt` 由 `npm run update:blocklist` 產生，不要手動編輯。
- 權限採最小原則，新增 permission 前確認規格書確實需要。

## 目錄配置

- 父元件／頁面放在 `src/views/`；View 檔名使用 PascalCase，原則上以 `View` 結尾。
- 擴充功能中每個被掛載的 Vue 根元件都算父元件，放在 `src/views/`，例如 popup、設定頁、content script 注入的風險提示 UI。
- 子元件一律放在 `src/components/`，包括只供單一頁面使用的子元件；依功能分組，例如 `src/components/risk-alert/`。
- 全局共用的 composables、constants、types 分別放在 `src/composables/`、`src/constants/`、`src/types/`。
- 只屬於父元件／單一頁面的 composables、constants、types、utils，放在 `src/views/<page>/` 的對應子資料夾，與父元件共置。
- 頁面資料夾使用 kebab-case。不預先建立沒有實際檔案的資料夾。
- 不在 `views` 下建立子元件的 `components/` 資料夾。
- 頁面專屬資料或型別若之後跨頁共用，再移到 `src` 對應的全局目錄。
- 搬動檔案時，同步更新所有 import 與測試路徑。

```text
src/
├── components/
│   └── risk-alert/
│       ├── RiskBadge.vue
│       └── RiskReasonPanel.vue
├── composables/             # 全局共用
├── constants/               # 全局共用
├── types/                   # 全局共用
└── views/
    └── risk-alert/
        ├── RiskAlertView.vue
        ├── composables/     # 此頁專屬
        ├── constants/       # 此頁專屬
        └── types/           # 此頁專屬
```

## Export 風格

- composable 檔（匯出 `useXxx`，含 `src/composables/` 與各層就近放置的 `composables/`）維持逐一 `export`，宣告前直接加 `export`。
- 其餘一律集中匯出：宣告時不加 `export`，檔尾以 `export { ... }` 列出值、`export type { ... }` 列出型別。適用於 `content/`、`utils/`、`constants/`、`types/` 與其他非 composable 的檔案。
- `enum` 同時是值與型別，集中匯出時要放在 `export { ... }`，不可放進 `export type { ... }`，否則執行期取不到。
- `export default`（設定檔）與 `export * from`、`export { ... } from` 的 re-export 原樣保留，不受此規則影響。
- 集中匯出的清單依宣告順序排列，不另外排序，方便對照檔案內容。

## 樣式

- 使用 Tailwind CSS v3，樣式直接寫在 template 的 `class`；content script 注入的 UI 在 Shadow DOM 內載入 Tailwind，不影響 Threads 頁面。
- 固定間距、尺寸、圓角、字級、行高與線寬使用明確 px，例如 `mt-[4px]`、`w-[288px]`、`rounded-[12px]`、`text-[12px]`、`leading-[16px]`、`border-[1px]`；不使用 `mt-1`、`w-72`、`rounded-xl`、`text-xs`、`border` 這類預設級距。
- `0`、`auto`、`%`／視窗單位，以及顏色、字重、透明度、陰影、縮放維持 Tailwind 預設 class，例如 `m-0`、`inset-auto`、`text-red-600`、`font-semibold`、`shadow-lg`。
- `text-xs` 這類字級 class 同時設定行高，改寫成 px 時要一併寫 `leading-[...]`，避免行高改變。
- 元件 `<spec lang="md">` 的「狀態與限制」需依上述規則說明樣式。

## Vue SFC 規範

- SFC 區塊順序為 `<script setup lang="ts">`、`<template>`、`<style scoped>`、`<spec lang="md">`。
- `<spec>` 區塊由 `vite.config.ts` 的 `vue-spec-plugin` 在建置時移除，不進入打包結果。
- 新增或調整主要 view／元件時，維護 `<spec lang="md">`；使用 Markdown 格式：`# 元件名稱`，依序包含 `## 元件定位`、`## 公開介面`、`## 主要行為`、`## 狀態與限制`，各節以條列說明。公開介面列出 Props、v-model、Emits 與主要依賴；內容必須符合實際程式，不套用未實作的行為。
