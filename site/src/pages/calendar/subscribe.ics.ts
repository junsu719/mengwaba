import type { APIRoute } from 'astro';
import { CALENDAR_YEARS, loadCalendarYear, buildIcsFeed } from '../../lib/calendar';

// 跨年度合併訂閱檔(2026-09-01 二輪拍板,見 DECISIONS.md):單一年度的 .ics(見 [year].ics.ts)
// 訂閱起來名不副實——那個檔案永遠只有那一年,隔年新增年度資料後訂閱者的行事曆不會自動出現
// 新年度,但「訂閱」給人的心智模型是訂一次就一勞永逸。這支路由改成涵蓋 CALENDAR_YEARS 目前
// 註冊的所有年度,之後每季/每年更新資料時只要把新年度加進 CALENDAR_YEARS(既有既定流程,
// 見 calendar.ts),這份合併檔會自動含入新年度,不需要另外維護合併邏輯。
//
// 同樣是 prerender 靜態產物(見 [year].ics.ts 開頭註解同一個限制),Content-Type 由
// site/public/_headers 的 `/calendar/subscribe.ics` 規則負責,不是這裡的 Response headers。
const generatedAt = new Date();

export const GET: APIRoute = ({ site }) => {
  const dataYears = CALENDAR_YEARS.map((year) => loadCalendarYear(year));
  const base = (site?.href ?? 'https://mengwaba.com/').replace(/\/$/, '');
  const body = buildIcsFeed(dataYears, base, generatedAt);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="mengwaba-holidays.ics"',
    },
  });
};
