# ScamLens Agent Rules

本檔案適用於整個專案。規格書：`/Users/yan/Downloads/social_risk_extension_spec_v2.pdf`（社群可疑內容即時預警 Chrome Extension）。

## 擴充功能入口

- 使用 `@crxjs/vite-plugin`；manifest 寫在 `vite.config.ts` 的 `crx({ manifest })`，不另放 `manifest.json`。
- popup：`index.html` → `src/main.ts` → `src/App.vue`。
- content script：`src/content/main.ts`，只注入 `https://www.threads.com/*`。第一版先支援 Threads（使用者決定，規格書原為 Instagram 優先），IG 之後再加。偵測範圍為首頁動態與他人帳號頁（個人頁、單篇貼文含留言），比規格書第 14 節建議的「只限首頁」更廣，也是使用者決定。
- content script 的非 Vue 模組（平台 Adapter 等）放 `src/content/`，例如 `src/content/threadsAdapter.ts`。
- 單篇貼文頁上其他帳號的留言當主貼文的佐證（社群反應），規則見 `docs/risk-rules.md` 第 6 節；不爬取按讚者或留言者的個人頁。
- 帳號標示（使用者決定，規格書第 5 節原本要求有帳號層級證據才標示帳號）：貼文判定有風險時標示作者帳號，等級取該帳號已看到貼文的最高等級，記在 `src/content/accountRisks.ts`。
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

## Vue SFC 規範

- SFC 區塊順序為 `<script setup lang="ts">`、`<template>`、`<style scoped>`、`<spec lang="md">`。
- `<spec>` 區塊由 `vite.config.ts` 的 `vue-spec-plugin` 在建置時移除，不進入打包結果。
- 新增或調整主要 view／元件時，維護 `<spec lang="md">`；使用 Markdown 格式：`# 元件名稱`，依序包含 `## 元件定位`、`## 公開介面`、`## 主要行為`、`## 狀態與限制`，各節以條列說明。公開介面列出 Props、v-model、Emits 與主要依賴；內容必須符合實際程式，不套用未實作的行為。
