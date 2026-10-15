<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import SettingSwitch from '@/components/settings/SettingSwitch.vue';
import { ENGINE_VERSION } from '@/engine/riskRules';
import type { Platform } from '@/types/post';
import type { VisibleRiskLevel } from '@/types/risk';
import type { Settings } from '@/types/settings';
import type { IgnoredAccount, StoredPost } from '@/utils/riskStorage';
import {
  DEFAULT_SETTINGS,
  clearStoredResults,
  loadStoredRisks,
  saveIgnoredAccounts,
  saveSettings,
} from '@/utils/riskStorage';

const PLATFORM_NAMES: Record<Platform, string> = { threads: 'Threads', x: 'X' };
const profileUrl = ({ platform, handle }: IgnoredAccount) =>
  platform === 'x'
    ? `https://x.com/${handle}`
    : `https://www.threads.com/@${handle}`;

const LEVEL_OPTIONS: { value: VisibleRiskLevel; label: string }[] = [
  { value: 'notice', label: '全部' },
  { value: 'caution', label: '注意以上' },
  { value: 'high', label: '只有高風險' },
];

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const posts = ref<StoredPost[]>([]);
const ignoredAccounts = ref<IgnoredAccount[]>([]);
const loaded = ref(false);
const error = ref('');
// 取消忽略、清除快取只影響之後的判定，提示已開啟的分頁要重新整理。
const notice = ref('');

const { version } = chrome.runtime.getManifest();
const countLevel = (level: StoredPost['result']['level']) =>
  posts.value.filter(({ result }) => result.level === level).length;
const flaggedCount = computed(() => posts.value.length - countLevel('unknown'));
const imageCount = computed(
  () => posts.value.filter(({ imageText }) => imageText !== undefined).length
);

const run = async (action: () => Promise<void>, done?: string) => {
  error.value = '';
  try {
    await action();
    if (done) notice.value = done;
  } catch (cause) {
    error.value = `儲存失敗：${String(cause)}`;
  }
};

onMounted(() =>
  run(async () => {
    const stored = await loadStoredRisks();
    settings.value = stored.settings;
    posts.value = stored.posts;
    ignoredAccounts.value = stored.ignoredAccounts;
  }).finally(() => {
    loaded.value = true;
  })
);

// Threads、X 分頁監聽 settings，改了馬上生效，不用重新整理。
const update = (patch: Partial<Settings>) =>
  run(async () => {
    const next = { ...settings.value, ...patch };
    settings.value = next;
    await saveSettings(next);
  });

const unignore = (account: IgnoredAccount) =>
  run(async () => {
    const next = ignoredAccounts.value.filter((item) => item !== account);
    ignoredAccounts.value = next;
    await saveIgnoredAccounts(next);
  }, `已取消忽略 ${PLATFORM_NAMES[account.platform]} @${account.handle}，已開啟的分頁重新整理後恢復標示。`);

const clearCache = () =>
  run(async () => {
    await clearStoredResults();
    posts.value = [];
  }, '已清除判定快取，已開啟的分頁重新整理後重新判定。');
</script>

<template>
  <main
    class="w-[320px] bg-white p-[16px] text-[13px] leading-[18px] text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
  >
    <header class="flex items-center gap-[8px]">
      <img
        src="/icons/icon-32.png"
        alt=""
        class="size-[24px]"
      />
      <h1 class="text-[15px] font-semibold leading-[20px]">ScamLens</h1>
      <span class="ml-auto text-[12px] leading-[16px] opacity-60">
        v{{ version }}
      </span>
    </header>

    <p
      v-if="error"
      role="alert"
      class="mt-[12px] rounded-[8px] bg-red-50 p-[8px] text-[12px] leading-[16px] text-red-700 dark:bg-red-950 dark:text-red-200"
    >
      {{ error }}
    </p>

    <template v-if="loaded">
      <section class="mt-[16px]">
        <SettingSwitch
          label="偵測 Threads 與 X 貼文"
          :description="
            settings.enabled
              ? '瀏覽時自動檢查貼文與圖片'
              : '已暫停，畫面上的標示已移除'
          "
          :model-value="settings.enabled"
          @update:model-value="update({ enabled: $event })"
        />
      </section>

      <fieldset
        class="mt-[16px]"
        :disabled="!settings.enabled"
      >
        <legend class="font-medium">顯示哪些標示</legend>
        <div
          class="mt-[8px] grid grid-cols-3 gap-[4px] rounded-[8px] bg-neutral-100 p-[4px] dark:bg-neutral-800"
          :class="{ 'opacity-50': !settings.enabled }"
        >
          <label
            v-for="option in LEVEL_OPTIONS"
            :key="option.value"
            class="cursor-pointer rounded-[6px] px-[4px] py-[6px] text-center text-[12px] leading-[16px] has-[:checked]:bg-white has-[:checked]:font-medium has-[:checked]:shadow-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-[2px] has-[:focus-visible]:outline-blue-600 dark:has-[:checked]:bg-neutral-700"
          >
            <input
              type="radio"
              name="minLevel"
              class="sr-only"
              :value="option.value"
              :checked="settings.minLevel === option.value"
              @change="update({ minLevel: option.value })"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>

      <section class="mt-[16px]">
        <SettingSwitch
          label="顯示已檢查的帳號"
          description="沒發現可疑特徵的帳號也掛灰色勾勾，確認 ScamLens 有在運作；不代表帳號安全"
          :disabled="!settings.enabled"
          :model-value="settings.showChecked"
          @update:model-value="update({ showChecked: $event })"
        />
      </section>

      <section class="mt-[16px]">
        <h2 class="font-medium">
          已忽略的帳號（{{ ignoredAccounts.length }}）
        </h2>
        <p
          v-if="!ignoredAccounts.length"
          class="mt-[4px] text-[12px] leading-[16px] opacity-70"
        >
          尚未忽略任何帳號。點頭像旁的標示，可以忽略該帳號。
        </p>
        <ul
          v-else
          class="mt-[4px] max-h-[160px] divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-700"
        >
          <li
            v-for="account in ignoredAccounts"
            :key="`${account.platform}:${account.handle}`"
            class="flex items-center gap-[8px] py-[6px]"
          >
            <span
              class="shrink-0 rounded-[4px] bg-neutral-100 px-[4px] text-[11px] leading-[16px] opacity-80 dark:bg-neutral-800"
            >
              {{ PLATFORM_NAMES[account.platform] }}
            </span>
            <a
              :href="profileUrl(account)"
              target="_blank"
              rel="noreferrer"
              class="truncate hover:underline"
            >
              @{{ account.handle }}
            </a>
            <button
              type="button"
              class="ml-auto shrink-0 cursor-pointer text-[12px] leading-[16px] text-blue-600 hover:underline dark:text-blue-400"
              @click="unignore(account)"
            >
              取消忽略
            </button>
          </li>
        </ul>
      </section>

      <section class="mt-[16px]">
        <h2 class="font-medium">判定快取</h2>
        <p class="mt-[4px] text-[12px] leading-[16px] opacity-70">
          可疑貼文 {{ flaggedCount }} 篇、辨識過圖片 {{ imageCount }} 篇，保留 7
          天。
        </p>
        <button
          type="button"
          class="mt-[8px] cursor-pointer rounded-[8px] border-[1px] border-neutral-300 px-[12px] py-[6px] text-[12px] leading-[16px] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          :disabled="!posts.length"
          @click="clearCache"
        >
          清除判定快取
        </button>
      </section>

      <p
        v-if="notice"
        role="status"
        class="mt-[12px] rounded-[8px] bg-blue-50 p-[8px] text-[12px] leading-[16px] text-blue-800 dark:bg-blue-950 dark:text-blue-200"
      >
        {{ notice }}
      </p>

      <details class="mt-[16px] text-[12px] leading-[16px] opacity-70">
        <summary class="cursor-pointer">除錯資訊</summary>
        <dl class="mt-[4px] grid grid-cols-[auto_1fr] gap-x-[8px] gap-y-[2px]">
          <dt>分析版本</dt>
          <dd>{{ ENGINE_VERSION }}</dd>
          <dt>快取筆數</dt>
          <dd>
            {{ posts.length }}（高風險 {{ countLevel('high') }}、注意
            {{ countLevel('caution') }}、提醒 {{ countLevel('notice') }}）
          </dd>
        </dl>
      </details>
    </template>

    <p
      class="mt-[16px] border-t-[1px] border-neutral-200 pt-[8px] text-[11px] leading-[16px] opacity-60 dark:border-neutral-700"
    >
      標示只代表貼文有可疑特徵，不代表帳號已確認為詐騙。有疑問請撥 165
      反詐騙專線查證。
    </p>
  </main>
</template>

<spec lang="md">
# SettingsView

## 元件定位

- 擴充功能 popup 的設定頁（規格 FR-06）：偵測開關、顯示等級、已忽略帳號、判定快取與除錯資訊。

## 公開介面

- Props：無。
- v-model：無。
- Emits：無。
- 主要依賴：SettingSwitch、`src/utils/riskStorage.ts`（讀寫 chrome.storage.local 的設定、忽略清單與判定快取）、`ENGINE_VERSION`。

## 主要行為

- 開啟時讀取設定、忽略清單與判定快取；讀取時順便清掉過期或版本不符的判定。
- 偵測開關、「顯示哪些標示」與「顯示已檢查的帳號」改了就寫入 settings；Threads、X 分頁監聽變更，馬上停止或恢復偵測、隱藏或顯示標示。
- 「顯示已檢查的帳號」預設關閉：開啟後，沒發現可疑特徵的帳號也掛灰色「已看過 N 篇貼文、M 則留言」標示，方便確認 ScamLens 有在運作；不顯示「安全」（規格 US-05、第 5、7 節）。暫停偵測時停用。
- 「顯示哪些標示」三段：全部（提醒以上）、注意以上、只有高風險；暫停偵測時停用。
- 已忽略的帳號可以逐一取消忽略，前面標平台、帳號名稱連到該平台的個人頁；清除判定快取只刪貼文判定，設定與忽略清單保留。
- 取消忽略與清除快取不會即時反映在已開啟的分頁，完成後提示重新整理。
- 讀寫失敗時顯示錯誤訊息，不影響其他操作。

## 狀態與限制

- 規格 7 的 aiEnabled、urlCheckEnabled、dailyLimit 屬於還沒做的 M3 功能，這版沒有對應設定。
- 開關用 SettingSwitch（原生 checkbox，role="switch"）、等級用原生 radio，鍵盤可操作；依系統深淺色切換配色。
- 樣式使用 Tailwind utility class，固定寬度 320px，間距、尺寸、圓角、字級、行高與線寬寫明確 px。
- 底部固定顯示「不代表帳號已確認為詐騙」與 165 查證說明（規格 5 禁止定性文案）。
</spec>
