import { describe, expect, it } from 'vitest';
import type { SearchIndex } from './search';
import { normalizeText, searchPoints } from './search-match';

// 縣市: 0 高雄市 1 臺中市 2 新北市;「中區」「大安」跨縣市/易混淆
const data: SearchIndex = {
  cities: [
    { s: 'kaohsiung', n: '高雄市' },
    { s: 'taichung', n: '臺中市' },
    { s: 'xinbei', n: '新北市' },
  ],
  districts: [
    { s: 'sanmin', n: '三民區' }, // 0 高雄
    { s: 'zhongqu', n: '中區' }, // 1 臺中
    { s: 'xizhi', n: '汐止區' }, // 2 新北
    { s: 'sanmin', n: '三民區' }, // 3 臺中也有(假設跨縣市同名)
    { s: 'daan', n: '大安區' }, // 4 臺中
  ],
  points: [
    [0, 0, '大連街1號', '大連里', 'A1'],
    [0, 0, '大連街2號', null, 'A2'],
    [1, 3, '大連街9號', null, 'B1'], // 臺中三民區同名路
    [2, 2, '大連街5號', null, 'C1'], // 新北同名路
    [1, 1, '台中路3號', null, 'D1'],
    [1, 4, '大安路10號', null, 'E1'],
  ],
};
const hrefs = (q: string) => searchPoints(data, q).map((m) => m.href);

describe('normalizeText', () => {
  it('台臺、空白、標點', () => {
    expect(normalizeText('臺中市 三民區,大連街')).toBe('台中市三民區大連街');
  });
});

describe('searchPoints 縣市/行政區篩選', () => {
  const khh = ['/trash/kaohsiung/sanmin/A1/', '/trash/kaohsiung/sanmin/A2/'];
  it.each(['高雄市三民區大連街', '高雄三民區大連街', '高雄市 三民區 大連街', '高雄市,三民區,大連街', '高雄三民大連街'])(
    '%s → 只有高雄三民區',
    (q) => expect(hrefs(q).sort()).toEqual(khh)
  );
  it('只打行政區:跨縣市同名都出現且標示縣市', () => {
    const r = searchPoints(data, '三民區大連街');
    expect(r.map((m) => m.href).sort()).toEqual([...khh, '/trash/taichung/sanmin/B1/'].sort());
    expect(r.every((m) => /^(高雄市|臺中市)/.test(m.sub))).toBe(true);
  });
  it('三民大連街(省略區)', () => expect(hrefs('三民大連街')).toHaveLength(3));
  it('跨縣市同名路名:有打縣市只出現該縣市', () => {
    expect(hrefs('新北市大連街')).toEqual(['/trash/xinbei/xizhi/C1/']);
    expect(hrefs('高雄市大連街').every((h) => h.includes('/kaohsiung/'))).toBe(true);
    expect(hrefs('臺中市大連街')).toEqual(['/trash/taichung/sanmin/B1/']);
    expect(hrefs('台中大連街')).toEqual(['/trash/taichung/sanmin/B1/']);
  });
  it('有指定縣市時不重複標示縣市,沒指定時標示', () => {
    expect(searchPoints(data, '高雄市大連街1號')[0].sub).toBe('三民區・大連里');
    expect(searchPoints(data, '大連街1號')[0].sub).toBe('高雄市三民區・大連里');
  });
  it('多打的孤立「台」字仍限縮在篩選範圍內', () => {
    expect(hrefs('台高雄市三民區大連街').sort()).toEqual(khh);
  });
  it('路名含縣市字樣(台中路)不被誤拆', () => expect(hrefs('台中路')).toEqual(['/trash/taichung/zhongqu/D1/']));
  it('路名含行政區簡稱(大安路)不被當行政區篩選', () => expect(hrefs('大安路')).toEqual(['/trash/taichung/daan/E1/']));
  it('單打路名維持原行為', () => expect(hrefs('大連街')).toHaveLength(4));
  it('單打行政區列出該區', () => expect(hrefs('汐止區')).toEqual(['/trash/xinbei/xizhi/C1/']));
});
