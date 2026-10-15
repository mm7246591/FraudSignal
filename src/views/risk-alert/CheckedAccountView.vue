<script setup lang="ts">
import { computed } from 'vue';
import RiskBadge from '@/components/risk-alert/RiskBadge.vue';
import type { PostKind } from '@/types/post';
import { CHECKED_STYLE } from './constants/riskLevel';

// checked 是 reactive Map（網址 → 貼文或留言）：同帳號再看到新貼文、留言時數量自動更新。
const props = defineProps<{
  checked: ReadonlyMap<string, PostKind>;
  dark: boolean;
}>();

const summary = computed(() => {
  const kinds = [...props.checked.values()];
  const replies = kinds.filter((kind) => kind === 'reply').length;
  const posts = kinds.length - replies;
  const parts: string[] = [];
  if (posts) parts.push(`${posts} 篇貼文`);
  if (replies) parts.push(`${replies} 則留言`);
  return `已看過 ${parts.join('、')}，未發現可疑特徵`;
});
</script>

<template>
  <!-- 點擊不能冒泡到原站：頭像與整篇貼文都是可點擊區塊，會跳頁。 -->
  <span
    class="inline-flex"
    @click.stop
    @pointerdown.stop
  >
    <RiskBadge
      popovertarget="fraudsignal-checked"
      :label="CHECKED_STYLE.label"
      :summary="summary"
      :icon="CHECKED_STYLE.icon"
      :icon-class="CHECKED_STYLE.iconClass"
    />
    <div
      id="fraudsignal-checked"
      popover
      role="dialog"
      aria-label="FraudSignal 檢查結果"
      class="inset-auto m-0 mt-[4px] w-[256px] rounded-[12px] border-[1px] p-[12px] text-left text-[13px] leading-[18px] shadow-lg [position-anchor:--fraudsignal-badge] [position-area:bottom_span-right] [position-try-fallbacks:flip-block,flip-inline]"
      :class="
        dark
          ? 'border-neutral-700 bg-neutral-900 text-neutral-100'
          : 'border-neutral-200 bg-white text-neutral-900'
      "
    >
      <p class="font-semibold">{{ summary }}</p>
      <p class="mt-[8px] text-[12px] leading-[16px] opacity-70">
        只代表 FraudSignal 的規則沒有命中，不代表帳號安全。有疑問請撥 165
        反詐騙專線。
      </p>
    </div>
  </span>
</template>

<spec lang="md">
# CheckedAccountView

## 元件定位

- content script 掛在作者頭像右下角的根元件：設定頁開啟「顯示已檢查的帳號」時，沒發現可疑特徵的帳號顯示灰色「已檢查」標示，讓使用者確認 FraudSignal 有在運作。

## 公開介面

- Props：checked（這個帳號已檢查的網址 → 貼文或留言，reactive Map）、dark。
- v-model：無。
- Emits：無。
- 主要依賴：RiskBadge、`constants/riskLevel.ts` 的 CHECKED_STYLE。

## 主要行為

- 標示顯示灰色勾勾；點開說明「已看過 N 篇貼文、M 則留言，未發現可疑特徵」，數量是 0 的那項不寫（例如只看過留言就寫「已看過 1 則留言」）。
- 只算這次在畫面上看過的貼文與留言（規格 2.2 不爬取帳號全部貼文），隨看到的增加；留言只有單篇貼文頁主貼文下方、其他帳號的回覆，其他頁面都算貼文；作者自己的回覆是串文，不另外計數（使用者決定）。
- 說明固定寫明不代表帳號安全，並附 165 查證說明。
- 攔截 click 與 pointerdown，避免點標示或說明時觸發原站跳頁。

## 狀態與限制

- 不顯示「安全」：規格 US-05、第 5、7 節不把 unknown 當 safe；使用者同意改用中性的「已檢查」，所以用灰色勾勾，不用綠色或盾牌。
- 帳號一被判定有風險，由 `src/content/mountRiskAlert.ts` 換成 RiskAlertView；被忽略的帳號不顯示。
- 每個頭像各自一個 Shadow DOM，popover id 固定為 `fraudsignal-checked` 也不會衝突。
- 樣式使用 Tailwind utility class，固定間距、尺寸、圓角、字級、行高與線寬寫明確 px，依 dark 切換配色，在 Shadow DOM 內載入。
</spec>
