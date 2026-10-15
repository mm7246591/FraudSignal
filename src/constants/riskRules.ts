import type { RiskCategory, RiskStrength } from '@/types/risk';

// 規則或清單改變時遞增，讓快取失效（規格 9）。
const ENGINE_VERSION = '2';

// 「不保證獲利」「哪有穩賺不賠」這類否定句不算。
const NOT = '(?<!不|沒|無|非|別|哪有|沒有|不會|不可能|絕不|並非|不是)';
const HOT_ITEMS = '(iphone|switch|ps5|筆電|macbook|airpods|ipad)';
const FREE = '(免費送|免費贈送|0元|零元)';

type TextRule = {
  id: string;
  category: RiskCategory;
  strength: Exclude<RiskStrength, 'critical'>;
  label: string;
  /** 比對正規化後的文字：小寫、全形轉半形、去除空白與夾在字中間的符號。 */
  pattern: RegExp;
};

// 字詞來源與取捨見 docs/risk-rules.md 第 4 節；不採用的字詞（投資、出清、主力…）刻意不列。
const TEXT_RULES: TextRule[] = [
  {
    id: 'guaranteed-profit',
    category: 'lure',
    strength: 'strong',
    label: '宣稱保證獲利、穩賺不賠',
    pattern: new RegExp(
      `${NOT}(保證獲利|獲利保證|保證賺|穩賺不賠|穩賺|保本保息|包賺|只賺不賠)`
    ),
  },
  {
    id: 'trading-group-hook',
    category: 'lure',
    strength: 'strong',
    label: '投資帶單、飆股群組或「投資老師」',
    pattern:
      /帶單|飆股群|領(取)?飆股|(投資|股市|股票|投顧)老師|內線消息|老師帶(你|大家)/,
  },
  {
    id: 'crypto-arbitrage',
    category: 'lure',
    strength: 'strong',
    label: 'USDT 搬磚套利',
    pattern:
      /(usdt|泰達幣|u幣).{0,12}(搬磚|套利|穩定收益)|(搬磚|套利).{0,12}(usdt|泰達幣|u幣)/,
  },
  {
    id: 'free-hot-item',
    category: 'lure',
    strength: 'strong',
    label: '免費送 iPhone 等熱門商品',
    pattern: new RegExp(
      `${FREE}.{0,15}${HOT_ITEMS}|${HOT_ITEMS}.{0,15}${FREE}`
    ),
  },
  {
    id: 'opening-giveaway',
    category: 'lure',
    strength: 'strong',
    label: '新開幕免費送',
    pattern: /新開幕.{0,8}免費/,
  },
  {
    id: 'copy-trading',
    category: 'lure',
    strength: 'weak',
    label: '跟單',
    pattern: /跟單/,
  },
  {
    id: 'income-claim',
    category: 'lure',
    strength: 'weak',
    label: '宣稱日賺、月入或被動收入',
    pattern: /(日賺|日入|月入|月賺|週賺)\d|被動收入/,
  },
  {
    id: 'withdrawal',
    category: 'lure',
    strength: 'weak',
    label: '提到出金',
    pattern: /出金/,
  },
  {
    id: 'zero-risk',
    category: 'lure',
    strength: 'weak',
    label: '宣稱零風險',
    pattern: new RegExp(`${NOT}零風險`),
  },
  {
    id: 'clearance',
    category: 'lure',
    strength: 'weak',
    label: '倒店清倉、超低折扣',
    pattern: /倒店|倒閉出清|清倉|一折|(?<!\d)1折|下殺/,
  },
  {
    id: 'farm-direct',
    category: 'lure',
    strength: 'weak',
    label: '產地直送、支持小農等農產品話術',
    pattern: /產地直送|現採現寄|因盛產|支持小農|果園直(送|供|銷)/,
  },
  {
    id: 'urgency',
    category: 'lure',
    strength: 'weak',
    label: '限時、名額有限等催促',
    pattern: /名額有限|限量名額|限時(?!動態)|最後(\d+|幾)(組|名|個)/,
  },
  {
    id: 'line-support',
    category: 'offPlatform',
    strength: 'strong',
    label: '引導加 LINE 客服',
    pattern: /(line|賴)客服|客服(line|賴)|加客服/,
  },
  {
    id: 'invest-group-invite',
    category: 'offPlatform',
    strength: 'strong',
    label: '邀請加入投資群組',
    pattern:
      /(加入|加|進入|進)(我們的)?(投資|股票|飆股|理財|股市)(交流)?(群|社群)/,
  },
  {
    id: 'telegram',
    category: 'offPlatform',
    strength: 'strong',
    label: '引導到 Telegram',
    pattern: /telegram|飛機群|加飛機|飛機號|(?<![a-z])tg(?![a-z])/,
  },
  {
    id: 'contact-private',
    category: 'offPlatform',
    strength: 'weak',
    label: '引導私訊或加 LINE',
    pattern:
      /(加|\+)(line|賴|好友)|lineid|line[:：]|賴[:：]|私訊|私我|小盒子|dm我/,
  },
  {
    id: 'scam-flow',
    category: 'payment',
    strength: 'weak',
    label: '金流驗證、實名認證等詐騙流程話術',
    pattern:
      /金流(驗證|認證|簽署)|簽署金流|實名認證|解除(帳戶|帳號|金流)?限制|帳(戶|號)(遭|被)?凍結|驗證費|無卡提款|otp/,
  },
  {
    id: 'prepay-deposit',
    category: 'payment',
    strength: 'strong',
    label: '要求先付保證金',
    pattern: /(先|預)(付|繳|匯)款?.{0,4}保證金|保證金.{0,6}(才能|才可|先)/,
  },
  {
    id: 'prepay-only',
    category: 'payment',
    strength: 'weak',
    label: '要求先匯款',
    pattern: /只能先匯款|只收匯款|先匯款|匯款後(寄出|出貨)|先轉帳/,
  },
];

type LinkRule = {
  id: string;
  category: RiskCategory;
  strength: RiskStrength;
  label: string;
  test: (url: URL) => boolean;
};

const SHORTENER_HOSTS = new Set([
  'reurl.cc',
  'bit.ly',
  'tinyurl.com',
  'lihi.cc',
  'lihi1.com',
  'lihi2.cc',
  'lihi3.cc',
  'pse.is',
  'ppt.cc',
  'is.gd',
  'cutt.ly',
  't.ly',
  'shorturl.at',
]);
// 165 清單中最常見的詐騙頂級網域；.shop、.store 正常店家也常用，不列入。
const SUSPICIOUS_TLD =
  /\.(top|xyz|cyou|qpon|icu|vip|buzz|sbs|cfd|click|site|asia|online)$/;
const OFFICIAL_PLATFORM =
  /(^|\.)(7-11\.com\.tw|famiport\.com\.tw|family\.com\.tw)$/;
const PLATFORM_LOOKALIKE = /myship|famiport|7-?eleven|family-?mart/;

const hostOf = (url: URL) => url.hostname.replace(/^www\./, '');

const LINK_RULES: LinkRule[] = [
  {
    id: 'platform-lookalike',
    category: 'link',
    strength: 'critical',
    label: '連結網域仿冒超商物流平台（官方為 myship.7-11.com.tw）',
    test: (url) =>
      PLATFORM_LOOKALIKE.test(hostOf(url)) &&
      !OFFICIAL_PLATFORM.test(hostOf(url)),
  },
  {
    id: 'line-group-link',
    category: 'offPlatform',
    strength: 'strong',
    label: 'LINE 群組邀請連結',
    test: (url) =>
      hostOf(url) === 'line.me' && /\/ti\/g2?\//i.test(url.pathname),
  },
  {
    id: 'telegram-link',
    category: 'offPlatform',
    strength: 'strong',
    label: 'Telegram 連結',
    test: (url) =>
      ['t.me', 'telegram.me', 'telegram.dog'].includes(hostOf(url)),
  },
  {
    id: 'line-contact-link',
    category: 'offPlatform',
    strength: 'weak',
    label: 'LINE 加好友連結',
    test: (url) =>
      hostOf(url) === 'lin.ee' ||
      (hostOf(url) === 'line.me' && !/\/ti\/g2?\//i.test(url.pathname)),
  },
  {
    id: 'whatsapp-link',
    category: 'offPlatform',
    strength: 'weak',
    label: 'WhatsApp 連結',
    test: (url) =>
      ['wa.me', 'chat.whatsapp.com', 'api.whatsapp.com'].includes(hostOf(url)),
  },
  {
    id: 'shortener',
    category: 'link',
    strength: 'weak',
    label: '縮網址，看不到真正目的地',
    test: (url) => SHORTENER_HOSTS.has(hostOf(url)),
  },
  {
    id: 'suspicious-tld',
    category: 'link',
    strength: 'weak',
    label: '網域使用詐騙常見的頂級網域',
    test: (url) => SUSPICIOUS_TLD.test(hostOf(url)),
  },
];

// 反向訊號：有正規平台連結時，「要求先匯款」不計分。
const OFFICIAL_COMMERCE_HOSTS = new Set([
  'myship.7-11.com.tw',
  'shopee.tw',
  'ruten.com.tw',
  'tw.bid.yahoo.com',
  'tw.buy.yahoo.com',
]);
// 反向訊號：貼文本身在提醒防詐時，只靠文字訊號最多「提醒」。
const WARNING_CONTEXT =
  /詐騙|小心|提醒大家|防詐|被騙|騙子|詐團|騙局|(?<!不)騙(你|人)|假裝|別亂點|不要亂點|別點|不要點|不要相信|受害|報案|(撥打|打|報)165|165(專線|反詐)|反詐/;

export {
  ENGINE_VERSION,
  TEXT_RULES,
  LINK_RULES,
  OFFICIAL_COMMERCE_HOSTS,
  WARNING_CONTEXT,
  hostOf,
};
