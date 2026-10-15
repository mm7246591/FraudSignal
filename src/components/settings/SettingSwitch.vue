<script setup lang="ts">
defineProps<{ label: string; description: string; disabled?: boolean }>();
const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <label
    class="flex items-center justify-between gap-[12px]"
    :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
  >
    <span>
      <span class="block font-medium">{{ label }}</span>
      <span class="block text-[12px] leading-[16px] opacity-70">
        {{ description }}
      </span>
    </span>
    <input
      v-model="checked"
      type="checkbox"
      role="switch"
      :disabled="disabled"
      class="relative h-[20px] w-[36px] shrink-0 cursor-pointer appearance-none rounded-full bg-neutral-300 transition-colors before:absolute before:left-[2px] before:top-[2px] before:size-[16px] before:rounded-full before:bg-white before:shadow before:transition-transform before:content-[''] checked:bg-blue-600 checked:before:translate-x-[16px] focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-offset-[2px] focus-visible:outline-blue-600 disabled:cursor-not-allowed dark:bg-neutral-600"
    />
  </label>
</template>

<spec lang="md">
# SettingSwitch

## 元件定位

- 設定頁的開關列：左邊標題與說明，右邊開關。

## 公開介面

- Props：label、description、disabled（選填）。
- v-model：開關狀態（boolean，必填）。
- Emits：update:modelValue（由 v-model 產生）。
- 主要依賴：無。

## 主要行為

- 點整列（label）或按空白鍵切換開關。
- disabled 時整列變淡、不能切換。

## 狀態與限制

- 用原生 checkbox 加 role="switch"，鍵盤與讀屏都能操作；樣式用 appearance-none 畫成開關。
- 樣式使用 Tailwind utility class，固定間距、尺寸、圓角、字級、行高與線寬寫明確 px，依系統深淺色切換配色。
</spec>
