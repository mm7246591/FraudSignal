import { createApp } from 'vue';
import type { AccountRisk } from '@/types/risk';
import RiskAlertView from '@/views/risk-alert/RiskAlertView.vue';
import styles from '@/assets/style.css?inline';
import { getAvatarFrame } from './threadsAdapter';

const HOST_ATTR = 'data-scamlens';
// 與 RiskBadge 的 size-[18px] 一致。
const BADGE_SIZE = 18;

// Threads 沒有可靠的深色模式標記，改看貼文主要文字顏色：淺色字代表深色背景。
const isDarkTheme = (el: Element) => {
  const [r, g, b] = (getComputedStyle(el).color.match(/\d+/g) ?? []).map(
    Number
  );
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
};

/**
 * 讓貼文頭像上的提示與作者帳號標示一致：
 * 移除重用節點留下的舊提示；帳號被標示時在頭像右下角掛上提示。
 */
export const syncAccountBadge = (
  container: Element,
  authorHandle: string,
  account?: AccountRisk
) => {
  const existing = container.querySelector(`[${HOST_ATTR}]`);
  if (existing?.getAttribute(HOST_ATTR) === authorHandle) return;
  existing?.remove();
  const frame = getAvatarFrame(container, authorHandle);
  if (!account || !frame) return;

  // 絕對定位，不改變 Threads 版面。頭像是圓形：標示圓心放在頭像圓心往右下 45° 的方向，
  // 距離 = 頭像半徑 + 標示半徑 + 1px，剛好貼在圓外不蓋住頭像（cos45° ≈ 0.7071）。
  if (getComputedStyle(frame).position === 'static') {
    frame.style.position = 'relative';
  }
  const host = document.createElement('span');
  host.setAttribute(HOST_ATTR, authorHandle);
  const offset = `(50% + ${BADGE_SIZE / 2 + 1}px) * 0.7071 - ${BADGE_SIZE / 2}px`;
  host.style.cssText = `position:absolute;left:calc(50% + ${offset});top:calc(50% + ${offset});z-index:1;line-height:0`;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const root = document.createElement('span');
  shadow.append(style, root);
  frame.append(host);
  // ponytail: 節點被 Threads 移除時沒有 unmount；App 很小且只有被標示的帳號才掛，記憶體有問題再處理。
  createApp(RiskAlertView, { account, dark: isDarkTheme(container) }).mount(
    root
  );
};
