<script setup lang="ts">
import { computed } from 'vue';
import RiskBadge from '@/components/risk-alert/RiskBadge.vue';
import RiskReasonPanel from '@/components/risk-alert/RiskReasonPanel.vue';
import { LEVEL_RANK } from '@/engine/riskRules';
import type { AccountRisk } from '@/types/risk';
import type { Settings } from '@/types/settings';
import { LEVEL_STYLES } from './constants/riskLevel';

const props = defineProps<{
  account: AccountRisk;
  display: Pick<Settings, 'minLevel'>;
  dark: boolean;
}>();
const emit = defineEmits<{ ignore: [] }>();

// account 是 reactive，同帳號再被判定到更高等級或更多貼文時自動更新。
const levelStyle = computed(() => LEVEL_STYLES[props.account.level]);
// display 也是 reactive：設定頁調高顯示等級時，低於門檻的標示隱藏。
const visible = computed(
  () => LEVEL_RANK[props.account.level] >= LEVEL_RANK[props.display.minLevel]
);
const posts = computed(() =>
  props.account.posts.map(({ postUrl, level, signals }) => ({
    postUrl,
    label: LEVEL_STYLES[level].label,
    signals,
  }))
);
</script>

<template>
  <!-- 點擊不能冒泡到 Threads：頭像與整篇貼文都是可點擊區塊，會跳頁。 -->
  <span
    v-if="visible"
    class="inline-flex"
    @click.stop
    @pointerdown.stop
  >
    <RiskBadge
      popovertarget="scamlens-reasons"
      :label="levelStyle.label"
      :summary="levelStyle.summary"
      :icon="levelStyle.icon"
      :icon-class="levelStyle.iconClass"
    />
    <RiskReasonPanel
      id="scamlens-reasons"
      :summary="levelStyle.summary"
      :posts="posts"
      :dark="dark"
      @ignore="emit('ignore')"
    />
  </span>
</template>

<spec lang="md">
# RiskAlertView

## 元件定位

- content script 掛在作者頭像右下角的根元件：帳號發過可疑貼文時顯示標示，組合標示按鈕與原因面板（規格 FR-04）。

## 公開介面

- Props：account（AccountRisk，reactive）、display（設定頁的 minLevel，reactive）、dark。
- v-model：無。
- Emits：ignore；由 `src/content/mountRiskAlert.ts` 掛載時以 onIgnore 接收，忽略帳號並移除畫面上這個帳號的所有標示。
- 主要依賴：RiskBadge、RiskReasonPanel、`constants/riskLevel.ts`（等級對應的圖示、顏色與文案）。

## 主要行為

- 標示等級取該帳號已看到貼文的最高等級；同帳號的每篇貼文、留言頭像都顯示同一個標示。
- 點標示開啟原因面板，列出觸發的貼文與原因；按「忽略此帳號」後標示消失，之後這個帳號的貼文都不再標示。
- 攔截 click 與 pointerdown，避免點標示或面板時觸發 Threads 跳頁。
- 帳號等級低於設定頁的「顯示哪些標示」（display.minLevel）時不顯示；改設定或帳號等級升高時自動更新。

## 狀態與限制

- 帳號標示由貼文判定推導，是使用者的決定；規格書第 5 節原本要求有帳號層級證據才標示帳號。
- 文案只陳述「發過可疑貼文」，不寫「此帳號是詐騙」（規格 5 禁止文案）。
- 每個頭像各自一個 Shadow DOM，所以 popover id 固定為 `scamlens-reasons` 也不會衝突。
- 帳號標示由 chrome.storage.local 快取的貼文判定還原，重新整理後仍在；判定 7 天後過期，或規則版本（ENGINE_VERSION）更新後失效。
</spec>
