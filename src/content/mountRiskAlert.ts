import { createApp, reactive } from 'vue';
import type { AccountRisk } from '@/types/risk';
import type { Settings } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/utils/riskStorage';
import CheckedAccountView from '@/views/risk-alert/CheckedAccountView.vue';
import RiskAlertView from '@/views/risk-alert/RiskAlertView.vue';
import styles from '@/assets/style.css?inline';
import { getCheckedPosts, ignoreAccount } from './accountRisks';
import { getAvatarFrame } from './threadsAdapter';

const HOST_ATTR = 'data-scamlens';
// 標示種類：risk（有風險）、checked（已檢查、未發現可疑）。
const KIND_ATTR = 'data-scamlens-kind';
// 與 RiskBadge 的 size-[18px] 一致。
const BADGE_SIZE = 18;

type BadgeKind = 'risk' | 'checked';

// 設定頁的「顯示哪些標示」；reactive，改了之後已掛上的標示直接顯示或隱藏，不用重新整理。
const display = reactive({ minLevel: DEFAULT_SETTINGS.minLevel });
// 設定頁的「顯示已檢查的帳號」；切換時由 main.ts 重新同步畫面上的標示。
let { showChecked } = DEFAULT_SETTINGS;

const setDisplay = ({
  minLevel,
  showChecked: next,
}: Pick<Settings, 'minLevel' | 'showChecked'>) => {
  display.minLevel = minLevel;
  showChecked = next;
};

/** 移除畫面上的標示：暫停偵測時全部移除，關閉「顯示已檢查」時只移除 checked。 */
const clearBadges = (kind?: BadgeKind) => {
  const selector = kind ? `[${KIND_ATTR}="${kind}"]` : `[${HOST_ATTR}]`;
  document.querySelectorAll(selector).forEach((host) => host.remove());
};

// Threads 沒有可靠的深色模式標記，改看貼文主要文字顏色：淺色字代表深色背景。
const isDarkTheme = (el: Element) => {
  const [r, g, b] = (getComputedStyle(el).color.match(/\d+/g) ?? []).map(
    Number
  );
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
};

// 忽略帳號後，畫面上這個帳號的所有提示一起移除。
const ignore = (authorHandle: string) => {
  ignoreAccount(authorHandle);
  document
    .querySelectorAll(`[${HOST_ATTR}="${authorHandle}"]`)
    .forEach((host) => host.remove());
};

/**
 * 讓貼文頭像上的提示與作者帳號標示一致：
 * 移除重用節點留下的舊提示或已不再標示的提示；帳號被標示時在頭像右下角掛上提示。
 * 開啟「顯示已檢查」時，檢查過、沒發現可疑的帳號掛灰色「已檢查」；帳號之後被標示就換成風險提示。
 */
const syncAccountBadge = (
  container: Element,
  authorHandle: string,
  account?: AccountRisk
) => {
  const checkedPosts = account ? undefined : getCheckedPosts(authorHandle);
  let kind: BadgeKind | undefined;
  if (account) kind = 'risk';
  else if (showChecked && checkedPosts?.size) kind = 'checked';
  const existing = container.querySelector(`[${HOST_ATTR}]`);
  if (
    kind &&
    existing?.getAttribute(HOST_ATTR) === authorHandle &&
    existing.getAttribute(KIND_ATTR) === kind
  ) {
    return;
  }
  existing?.remove();
  const frame = getAvatarFrame(container, authorHandle);
  if (!kind || !frame) return;

  // 絕對定位，不改變 Threads 版面。頭像是圓形：標示圓心放在頭像圓心往右下 45° 的方向，
  // 距離 = 頭像半徑 + 標示半徑 + 1px，剛好貼在圓外不蓋住頭像（cos45° ≈ 0.7071）。
  if (getComputedStyle(frame).position === 'static') {
    frame.style.position = 'relative';
  }
  const host = document.createElement('span');
  host.setAttribute(HOST_ATTR, authorHandle);
  host.setAttribute(KIND_ATTR, kind);
  const offset = `(50% + ${BADGE_SIZE / 2 + 1}px) * 0.7071 - ${BADGE_SIZE / 2}px`;
  host.style.cssText = `position:absolute;left:calc(50% + ${offset});top:calc(50% + ${offset});z-index:1;line-height:0`;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const root = document.createElement('span');
  shadow.append(style, root);
  frame.append(host);
  // ponytail: 節點被 Threads 移除時沒有 unmount；App 很小，平常只有被標示的帳號才掛
  // （開啟「顯示已檢查」時每個帳號都掛，只供確認運作），記憶體有問題再處理。
  const dark = isDarkTheme(container);
  /* eslint-disable vue/one-component-per-file -- 這裡是依帳號狀態掛載兩種根元件，不是在同一檔定義兩個元件 */
  if (account) {
    createApp(RiskAlertView, {
      account,
      display,
      dark,
      onIgnore: () => ignore(authorHandle),
    }).mount(root);
  } else if (checkedPosts) {
    createApp(CheckedAccountView, { checked: checkedPosts, dark }).mount(root);
  }
  /* eslint-enable vue/one-component-per-file */
};

export { setDisplay, clearBadges, syncAccountBadge };
