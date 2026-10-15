<script setup lang="ts">
defineProps<{
  label: string;
  summary: string;
  icon: string;
  iconClass: string;
}>();
</script>

<template>
  <button
    type="button"
    :title="`ScamLens ${label}：${summary}（點擊查看原因）`"
    :aria-label="`ScamLens ${label}：${summary}，查看原因`"
    class="block size-[18px] cursor-pointer [anchor-name:--scamlens-badge] hover:scale-110"
  >
    <svg
      viewBox="0 -960 960 960"
      class="size-full fill-current"
      :class="iconClass"
      aria-hidden="true"
    >
      <path :d="icon" />
    </svg>
  </button>
</template>

<spec lang="md">
# RiskBadge

## 元件定位

- 作者圓形頭像右下方、貼在圓外的帳號標示按鈕，點擊開啟判定原因。

## 公開介面

- Props：label（等級文字）、summary（等級摘要；與 label 一起組成 title 與 aria-label）、icon（SVG path）、iconClass（圖示顏色 class）。
- v-model：無。
- Emits：無；`popovertarget` 由父元件以屬性傳入，點擊時由瀏覽器開啟對應的 popover。
- 主要依賴：無。

## 主要行為

- 只顯示 18px 等級圖示；滑過顯示 title「ScamLens 等級：摘要（點擊查看原因）」。
- 設定 CSS anchor `--scamlens-badge`，讓原因面板定位在圖示下方。

## 狀態與限制

- 尺寸 18px 必須與 `src/content/mountRiskAlert.ts` 的 `BADGE_SIZE` 一致，否則會蓋到頭像。
- 圖示顏色在 Threads 淺色與深色背景的對比都 ≥ 3:1，不需要底色。
- 樣式使用 Tailwind utility class，在 Shadow DOM 內載入，不影響 Threads 頁面。
</spec>
