// 產生 src/lib/lunar-table.generated.ts:清運點頁「今天農曆」一行用的預先算好農曆月對照表。
// 為何不在頁面載入 lunar-javascript:完整函式庫壓縮後約 102KB(遠超 30KB 門檻),
// 只為顯示「農曆某年某月某日」不值得(2026-09-30 Jun 拍板,見 DECISIONS.md)。
// 用法:node scripts/gen-lunar-table.mjs [起始年] [結束年](預設 2026 2028)。
// 涵蓋範圍用完後該行會自動不渲染(不出錯),需重跑本腳本延長範圍。
import { Solar } from 'lunar-javascript';
import { writeFileSync } from 'node:fs';

const startYear = Number(process.argv[2] ?? 2026);
const endYear = Number(process.argv[3] ?? 2028);
// lunar-javascript 回傳簡體;月份名稱只有「腊」需轉繁體(與 lunar-term-s2t 的「臘」一致)
const monthName = (s) => s.replace('腊', '臘') + '月';

const months = [];
let d = Solar.fromYmd(startYear, 1, 1);
const last = Solar.fromYmd(endYear, 12, 31);
let cur = null;
while (d.getYear() < endYear || (d.getYear() === endYear && (d.getMonth() < 12 || d.getDay() <= 31))) {
  const l = d.getLunar();
  const key = `${l.getYear()}-${l.getMonth()}`;
  if (!cur || cur.key !== key) {
    cur = {
      key,
      start: d.toYmd(),
      year: l.getYearInGanZhi(),
      month: monthName(l.getMonthInChinese()),
      leap: l.getMonth() < 0,
      days: 0,
      firstDay: l.getDay(),
    };
    months.push(cur);
  }
  cur.days++;
  if (d.toYmd() === last.toYmd()) break;
  d = d.next(1);
}
// 第一個月若不是從初一開始(範圍起點落在月中),days 只算範圍內天數,firstDay 記錄起始日序
const rows = months.map((m) => [m.start, m.year, m.month, m.leap ? 1 : 0, m.firstDay, m.days]);
const out = `// 由 scripts/gen-lunar-table.mjs 產生,請勿手改。涵蓋 ${months[0].start} ~ ${last.toYmd()}。
// 每列:[該段起始國曆日, 農曆年干支, 農曆月名, 是否閏月, 起始日的農曆日序(1-30), 該段天數]
export const LUNAR_TABLE_RANGE = { start: '${months[0].start}', end: '${last.toYmd()}' } as const;
export const LUNAR_TABLE: ReadonlyArray<readonly [string, string, string, 0 | 1, number, number]> = ${JSON.stringify(rows)} as never;
`;
writeFileSync(new URL('../src/lib/lunar-table.generated.ts', import.meta.url), out);
console.log(`rows=${rows.length} ${months[0].start}~${last.toYmd()}`);
