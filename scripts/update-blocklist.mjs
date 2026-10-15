// 下載 165 涉詐網站清單，輸出 src/engine/blockedDomains.txt（每行一個網域，# 開頭為說明）。
// 用法：npm run update:blocklist
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCES = [
  {
    name: '165反詐騙諮詢專線_遭停止解析涉詐網站',
    url: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/9586E691-5D8C-4A1C-867B-32473EFCAA7B/download',
    columns: 5,
    hostColumn: 1,
  },
  {
    name: '165反詐騙諮詢專線_假投資(博弈)網站',
    url: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download',
    columns: 5,
    hostColumn: 1,
  },
];
// 資料錯誤時也不能封鎖的常用網域。
const NEVER_BLOCK = [
  'threads.com',
  'threads.net',
  'instagram.com',
  'facebook.com',
  'line.me',
  'lin.ee',
  'google.com',
  'youtube.com',
  'myship.7-11.com.tw',
  '7-11.com.tw',
  'shopee.tw',
];
const OUTPUT = new URL('../src/engine/blockedDomains.txt', import.meta.url);

const toHost = (value) => {
  try {
    const url = new URL(
      /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`
    );
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return null;
  }
};

const fetchHosts = async ({ name, url, columns, hostColumn }) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const lines = (await response.text())
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean);
  // ponytail: CSV 沒有引號欄位，直接以逗號切；欄數不符的列略過並回報。
  const rows = lines.map((line) => line.split(','));
  const skipped = rows.filter((row) => row.length !== columns).length;
  const hosts = rows
    .filter((row) => row.length === columns)
    .map((row) => toHost(row[hostColumn]))
    .filter(Boolean);
  console.log(`${name}: ${hosts.length} 筆，略過 ${skipped} 列`);
  return hosts;
};

const hostLists = await Promise.all(SOURCES.map(fetchHosts));
const hosts = new Set(hostLists.flat());
NEVER_BLOCK.filter((host) => hosts.delete(host)).forEach((host) =>
  console.warn(`已排除常用網域：${host}`)
);

const today = new Date().toISOString().slice(0, 10);
const header = [
  `# 來源：${SOURCES.map((source) => source.name).join('、')}（data.gov.tw，政府資料開放授權條款第 1 版）`,
  `# 下載日期：${today}`,
];
mkdirSync(new URL('.', OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${[...header, ...[...hosts].sort()].join('\n')}\n`);
console.log(`輸出 ${hosts.size} 個網域`);
