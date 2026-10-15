import { describe, expect, it } from 'vitest';
import type { PostSnapshot } from '@/types/post';
import { evaluatePost, parseBlocklist } from '@/engine/riskEngine';

const post = (visibleText: string, outboundUrls: string[] = []) =>
  ({
    platform: 'threads',
    postId: 'TEST',
    postUrl: 'https://www.threads.com/@someone/post/TEST',
    authorHandle: 'someone',
    visibleText,
    outboundUrls,
    imageUrls: [],
    observedAt: 0,
  }) satisfies PostSnapshot;

const levelOf = (text: string, urls?: string[]) =>
  evaluatePost(post(text, urls)).level;

// docs/risk-rules.md 第 5.1 節的範例。
describe('evaluatePost 判定等級', () => {
  it('正常賣家只寫先匯款：資料不足', () => {
    expect(levelOf('原價賣（買時1250）含運\n只能先匯款 店到店🙏')).toBe(
      'unknown'
    );
  });

  it('單一一般詞彙「投資」不觸發（規格 10）', () => {
    expect(levelOf('最近在研究投資，大家都買什麼？')).toBe('unknown');
  });

  it('一般股票討論不觸發', () => {
    expect(
      levelOf('今日外資投信同買，大戶持股比例增加，值得觀察後續發展')
    ).toBe('unknown');
  });

  it('保證獲利＋加 LINE：注意', () => {
    expect(levelOf('保證獲利！加LINE帶你飆股')).toBe('caution');
  });

  it('保證獲利＋先付保證金：兩類強訊號，高風險', () => {
    expect(levelOf('保證獲利，先付保證金就能開始')).toBe('high');
  });

  it('免費送 iPhone＋私訊：注意', () => {
    expect(levelOf('免費送 iPhone 16，有需要私訊我')).toBe('caution');
  });

  it('小農產地直送＋加 LINE 下單：資料不足', () => {
    expect(levelOf('自家果園產地直送，現採現寄，加LINE下單')).toBe('unknown');
  });

  it('門票轉售＋先匯款＋私訊：資料不足', () => {
    expect(levelOf('轉售演唱會門票兩張，只能先匯款，私訊')).toBe('unknown');
  });

  it('單一強訊號：提醒', () => {
    expect(levelOf('聽說有人在推穩賺不賠的方案')).toBe('notice');
  });

  it('否定句不算', () => {
    expect(levelOf('投資一定有風險，不保證獲利')).toBe('unknown');
    expect(levelOf('哪有穩賺不賠的事')).toBe('unknown');
  });

  it('防詐提醒貼文最多提醒', () => {
    expect(
      levelOf('提醒大家！有人說保證獲利叫你加LINE投資群組，小心詐騙')
    ).toBe('notice');
  });
});

describe('evaluatePost 連結', () => {
  it('仿冒賣貨便網域：高風險', () => {
    expect(
      levelOf('賣場在這', ['https://myship-711-com-tw-33a.shop/order'])
    ).toBe('high');
  });

  it('官方賣貨便連結＋先匯款：先匯款不計分', () => {
    const result = evaluatePost(
      post('只能先匯款', ['https://myship.7-11.com.tw/general/detail/GM1'])
    );
    expect(result.level).toBe('unknown');
    expect(result.signals).toEqual([]);
  });

  it('165 清單命中：高風險，標示清單版本', () => {
    const blocklist = parseBlocklist('# 下載日期：2026-10-15\nbad.example\n');
    const result = evaluatePost(
      post('看這裡', ['https://www.bad.example/x']),
      blocklist
    );
    expect(result.level).toBe('high');
    expect(result.signals[0].label).toContain('2026-10-15');
  });

  it('LINE 群組邀請連結＋保證獲利：高風險', () => {
    expect(levelOf('保證獲利', ['https://line.me/R/ti/g/abcdef'])).toBe('high');
  });

  it('防詐貼文附仿冒網域：連結證據不受防詐語境影響', () => {
    expect(levelOf('小心詐騙！', ['https://myship-711-com-tw-hc1.shop'])).toBe(
      'high'
    );
  });
});

describe('evaluatePost 證據', () => {
  it('拆字規避仍能比對，證據顯示原文', () => {
    const result = evaluatePost(post('穩.賺.不.賠，快加 L I N E 客服'));
    expect(result.signals.map((signal) => signal.evidence)).toEqual([
      '穩.賺.不.賠',
      'L I N E 客服',
      '加 L I N E',
    ]);
  });

  it('全形英數字也能比對', () => {
    expect(levelOf('ＵＳＤＴ搬磚套利，加ＬＩＮＥ客服')).toBe('high');
  });
});

// 2026-10-15 在 Threads 實際看到的正常貼文與留言（節錄），不應觸發任何提示。
describe('evaluatePost 真實正常貼文', () => {
  it.each([
    ['三麗鷗限時代購 9/18-9/22 很多花小兔新品現貨 價格請至IG精選'],
    ['想用低價入手現場三麗鷗商品的！！可以來蹲蹲我們的日本每日批發商店連線唷'],
    ['這家的美女老闆很愛送禮物 結帳時送我們超Q文具！！！'],
    ['沒辦法私你 可以私我嗎 想收魔王'],
    ['有多 萊希拉姆 捷克羅姆 150一顆 可北車、新埔、忠孝新生面交'],
    ['立牌一組1500 奇爾300 先西400 跟野餐墊350'],
    ['今晚觀察個股籌碼 今日這隻個股 跌停被敲開漲回5% 近日外資投信 籌碼換手'],
    ['他這個有時間限制嗎！'],
    ['您好我們是華視團隊，想請問能否取得您的畫面讓我們在新聞上報導使用呢?'],
    ['打擾一下 目前有投票 再麻煩大家（投票時請看完後面廣告才算完成）'],
  ])('%s', (text) => {
    expect(levelOf(text)).toBe('unknown');
  });

  it('賣場貼文附官方賣貨便連結', () => {
    expect(
      levelOf('拜託求看看我的賣場 搬家想要出清一些東西 賣場放這邊可直接下單', [
        'https://myship.7-11.com.tw/general/detail/GM2609176586737',
      ])
    ).toBe('unknown');
  });
});

describe('evaluatePost 防詐語境', () => {
  it('解釋詐騙手法的留言不提示（2026-10-15 實際誤判）', () => {
    expect(
      levelOf(
        '有假裝要買東西，騙你開賣場，然後說無法下單，要你匯款做金流驗證；對方傳給你的連結都別亂點'
      )
    ).toBe('unknown');
  });

  it('金流話術是弱訊號，搭配強誘餌仍會注意', () => {
    expect(levelOf('免費送 iPhone，需完成實名認證')).toBe('caution');
  });

  it('「不要相信」等提醒字眼：最多提醒', () => {
    expect(levelOf('有人假裝賣家說保證獲利，叫你加入投資群組，不要相信')).toBe(
      'notice'
    );
  });

  it('「不騙你」是詐騙常見說法，不算防詐語境', () => {
    expect(levelOf('不騙你，保證獲利，快加入投資群組')).toBe('high');
  });
});

// docs/risk-rules.md 第 6 節：留言只當佐證。
describe('evaluatePost 留言（社群反應）', () => {
  const comments = (...texts: string[]) =>
    texts.map((visibleText, i) => ({ authorHandle: `user${i}`, visibleText }));
  const levelWith = (text: string, list: ReturnType<typeof comments>) =>
    evaluatePost(post(text), undefined, list).level;
  const TICKET = '演唱會門票轉售，只能先匯款，私訊';

  it('只有弱訊號的貼文，2 個帳號說是騙子 → 注意', () => {
    expect(levelWith(TICKET, comments('騙子別買', '我被騙了 已報警'))).toBe(
      'caution'
    );
  });

  it('只有 1 個帳號這樣說，仍資料不足', () => {
    expect(levelWith(TICKET, comments('騙子別買', '還有嗎'))).toBe('unknown');
  });

  it('同一帳號留兩次只算 1 個帳號', () => {
    const list = [
      { authorHandle: 'a', visibleText: '騙子' },
      { authorHandle: 'a', visibleText: '已檢舉' },
    ];
    expect(levelWith(TICKET, list)).toBe('unknown');
  });

  it('貼文本身沒有訊號時不看留言', () => {
    expect(
      levelWith('大家買東西的經驗分享', comments('詐騙', '騙子', '已檢舉'))
    ).toBe('unknown');
  });

  it('貼文在提醒防詐時不看留言', () => {
    expect(
      levelWith(
        '提醒大家！有人說保證獲利叫你加 LINE 投資群組，小心詐騙',
        comments('我也被騙了', '騙子好多')
      )
    ).toBe('notice');
  });

  it('作者自己的留言不算', () => {
    const list = [
      { authorHandle: 'someone', visibleText: '有人說我是騙子' },
      { authorHandle: 'someone', visibleText: '已檢舉亂說的人' },
    ];
    expect(levelWith(TICKET, list)).toBe('unknown');
  });

  it('泛用提醒、否定句、身高 165 不算指認', () => {
    expect(
      levelWith(
        TICKET,
        comments('小心詐騙喔', '不是詐騙啦我買過', '165 公分穿 M', '注意別被騙')
      )
    ).toBe('unknown');
  });

  it('多個帳號留「感謝老師」等暗樁話術 → 由提醒升為注意', () => {
    const text = '這檔穩賺，想了解的留言';
    expect(levelWith(text, [])).toBe('notice');
    expect(
      levelWith(text, comments('感謝老師帶我賺了3萬', '已上車', '真的嗎'))
    ).toBe('caution');
  });

  it('3 個以上帳號留言幾乎相同 → 網軍弱訊號', () => {
    const text = '這檔穩賺，想了解的留言';
    const result = evaluatePost(
      post(text),
      undefined,
      comments(
        '這個方法真的很有用，推薦給大家！',
        '這個方法真的很有用，推薦給大家',
        '這個方法真的很有用推薦給大家😊'
      )
    );
    expect(result.level).toBe('caution');
    expect(result.signals.map((signal) => signal.ruleId)).toContain(
      'similar-comments'
    );
  });

  it('只有 2 個帳號相同、或「+1」這類短留言不算網軍', () => {
    const text = '這檔穩賺，想了解的留言';
    expect(
      levelWith(
        text,
        comments('這個方法真的很有用，推薦給大家！', '這個方法真的很有用')
      )
    ).toBe('notice');
    expect(levelWith(text, comments('+1', '+1', '+1', '已私', '已私'))).toBe(
      'notice'
    );
  });
});

// docs/risk-rules.md 第 7 節：圖片文字跟內文走同一套規則。
describe('evaluatePost 圖片文字', () => {
  const evaluate = (text: string, imageText: string) =>
    evaluatePost(post(text), undefined, [], imageText);

  it('內文正常、圖片寫保證獲利＋投資群組 → 高風險，證據標示圖片', () => {
    const result = evaluate(
      '今天分享一下',
      '保證 獲 利 穩 賺 不 賠\n名 額 有 限 立即 加 入 投資 群 組'
    );
    expect(result.level).toBe('high');
    expect(result.signals.every(({ source }) => source === 'image')).toBe(true);
  });

  it('只有圖片沒有內文也會判定', () => {
    expect(evaluate('', '保證獲利，快加入投資群組').level).toBe('high');
  });

  it('圖片跟內文命中同一條規則時只列內文', () => {
    const { signals } = evaluate('保證獲利', '保證獲利');
    expect(signals.map(({ source }) => source)).toEqual(['text']);
  });

  it('圖片在提醒防詐 → 最多提醒', () => {
    expect(evaluate('', '小心詐騙！有人說保證獲利叫你加入投資群組').level).toBe(
      'notice'
    );
  });
});
