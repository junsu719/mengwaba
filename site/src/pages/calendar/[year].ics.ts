import type { APIRoute, GetStaticPaths } from 'astro';
import { CALENDAR_YEARS, loadCalendarYear, buildIcsFeed } from '../../lib/calendar';

// build time 產生靜態 .ics(2026-09-01 拍板,見 DECISIONS.md):比照這個工具「全靜態、不碰
// D1」的方向,不做 on-demand 產生。季度/年度更新資料後需重新 build + deploy 才會反映新年度
// 資料,與行政區頁的既有慣例(CLAUDE.md「資料更新與機器角色」段落)一致。
export const getStaticPaths: GetStaticPaths = () => CALENDAR_YEARS.map((year) => ({ params: { year: String(year) } }));

const generatedAt = new Date();

export const GET: APIRoute = ({ params, site }) => {
  const year = Number(params.year);
  const data = loadCalendarYear(year);
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const body = buildIcsFeed(data, base, generatedAt);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="mengwaba-holidays-${year}.ics"`,
    },
  });
};
