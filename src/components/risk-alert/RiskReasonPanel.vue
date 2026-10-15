<script setup lang="ts">
import type { RiskSignal } from '@/types/risk';

type FlaggedPost = { postUrl: string; label: string; signals: RiskSignal[] };

defineProps<{ summary: string; posts: FlaggedPost[]; dark: boolean }>();
const emit = defineEmits<{ ignore: [] }>();
</script>

<template>
  <div
    popover
    role="dialog"
    aria-label="ScamLens 判定原因"
    class="inset-auto m-0 mt-[4px] max-h-[320px] w-[288px] overflow-y-auto rounded-[12px] border-[1px] p-[12px] text-left text-[13px] leading-[18px] shadow-lg [position-anchor:--scamlens-badge] [position-area:bottom_span-right] [position-try-fallbacks:flip-block,flip-inline]"
    :class="
      dark
        ? 'border-neutral-700 bg-neutral-900 text-neutral-100'
        : 'border-neutral-200 bg-white text-neutral-900'
    "
  >
    <p class="font-semibold">{{ summary }}</p>
    <section
      v-for="post in posts"
      :key="post.postUrl"
      class="mt-[12px] border-t-[1px] pt-[8px]"
      :class="dark ? 'border-neutral-700' : 'border-neutral-200'"
    >
      <p class="flex items-center justify-between font-medium">
        {{ post.label }}
        <a
          :href="post.postUrl"
          class="text-[12px] font-normal leading-[16px] underline"
        >
          查看貼文
        </a>
      </p>
      <ul class="mt-[4px] space-y-[6px]">
        <li
          v-for="signal in post.signals"
          :key="`${signal.ruleId}:${signal.evidence}`"
        >
          <p>{{ signal.label }}</p>
          <p class="break-all opacity-70">
            {{ signal.source === 'image' ? '圖片文字：' : '' }}「{{
              signal.evidence
            }}」
          </p>
        </li>
      </ul>
    </section>
    <p class="mt-[12px] text-[12px] leading-[16px] opacity-70">
      ScamLens 依貼文內容自動判斷，不代表此帳號已確認為詐騙。有疑問請撥 165
      反詐騙專線查證。
    </p>
    <button
      type="button"
      class="mt-[8px] cursor-pointer text-[12px] font-medium leading-[16px] underline"
      @click="emit('ignore')"
    >
      忽略此帳號，之後不再提示
    </button>
  </div>
</template>

<spec lang="md">
# RiskReasonPanel

## 元件定位

- 帳號標示點開後的原因面板：列出這個帳號被判定有風險的每篇貼文、觸發原因與判定限制（規格 US-02）。

## 公開介面

- Props：summary、posts（每篇的 postUrl、等級文字、signals）、dark。
- v-model：無。
- Emits：ignore（使用者按「忽略此帳號」）。
- 主要依賴：瀏覽器原生 Popover API 與 CSS anchor positioning（Chrome 125 以上）。

## 主要行為

- 以 `popover` 顯示在頂層，不會被 Threads 的版面裁切；點外面或按 Esc 關閉。
- 每篇貼文顯示等級與「查看貼文」連結（Threads 站內網址），下方列出訊號說明與原文證據；證據來自貼文照片時前面標「圖片文字：」。
- 底部「忽略此帳號，之後不再提示」只送出 ignore，移除標示與記錄由父層處理（規格 US-03）。
- 外部連結證據只顯示文字，不可點擊。
- 底部固定顯示「不代表此帳號已確認為詐騙」與 165 查證說明（規格 5 禁止定性文案）。

## 狀態與限制

- 證據以文字插值渲染，不產生 HTML（規格 8 防 XSS）。
- 內容超過高度時面板內捲動。
- 依 dark 切換背景與文字色；樣式使用 Tailwind utility class，固定間距、尺寸、圓角、字級與線寬寫明確 px，在 Shadow DOM 內載入。
- 以帳號為單位忽略是使用者決定，規格 US-03／第 7 節原為忽略單篇貼文。
- 忽略後無法在面板內復原，要到設定頁（popup）的「已忽略的帳號」取消忽略。
</spec>
