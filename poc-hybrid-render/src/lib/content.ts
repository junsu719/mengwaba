import type { CollectionPoint, ScheduleEntry } from './types';
import type { DistrictGroup } from './logic';
import { WEEKDAY_NAMES, todayScheduleEntry, todayWeekdayTaipei } from './logic';

/** 依 point_id 產生穩定雜湊,用來在多組文案中選擇變體,避免全站同一句模板換變數。 */
function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

export function weekdayListText(weekday: number[]): string {
  return weekday.map((d) => `週${WEEKDAY_NAMES[d]}`).join('、');
}

/** 沿街收運且到站/離站時間相同,代表車輛只是經過、不停等,措辭需與定點清運區分(見 CLAUDE.md 台中頁面規則)。 */
export function isPassThrough(entry: ScheduleEntry, collectionType: string): boolean {
  return collectionType === '沿街收運' && entry.arrive === entry.depart;
}

export function scheduleTimeText(entry: ScheduleEntry, collectionType: string): string {
  return isPassThrough(entry, collectionType) ? `約 ${entry.arrive} 經過` : `${entry.arrive}〜${entry.depart}`;
}

export function todaySummarySentence(point: CollectionPoint): string {
  const weekday = todayWeekdayTaipei();
  const entry = todayScheduleEntry(point, weekday);
  const seed = stableHash(point.point_id);
  const place = point.point_name ?? '這個清運點';

  if (entry) {
    const passThrough = isPassThrough(entry, point.collection_type);
    const variants = passThrough
      ? [
          `今天(週${WEEKDAY_NAMES[weekday]})垃圾車約 ${entry.arrive} 經過${place},此處為沿街收運、車輛不會停等,請提前在路邊等候。`,
          `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}為沿街收運路段,垃圾車約 ${entry.arrive} 經過,請提早把垃圾拿到路邊。`,
          `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,垃圾車約 ${entry.arrive} 經過此路段(沿街收運、不停留),建議提早 5 分鐘到路邊等候。`,
        ]
      : [
          `今天(週${WEEKDAY_NAMES[weekday]})垃圾車會來${place},預計 ${entry.arrive}〜${entry.depart} 停靠,請提前在時間內將垃圾拿到定點。`,
          `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}有清運班次,清運車抵達時間約 ${entry.arrive} 至 ${entry.depart},別錯過。`,
          `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,時間落在 ${entry.arrive}〜${entry.depart} 之間,建議提早 5 分鐘到定點等候。`,
        ];
    return pick(variants, seed).replace('today-yes: ', '');
  }

  const scheduledDays = [...new Set(point.schedule.flatMap((s) => s.weekday))].sort((a, b) => a - b);
  const nextDaysText = scheduledDays.length > 0 ? weekdayListText(scheduledDays) : '無固定班次資料';
  const variants = [
    `今天(週${WEEKDAY_NAMES[weekday]})${place}沒有排定清運班次,這個點固定收運日為${nextDaysText},請依時刻表安排倒垃圾時間。`,
    `週${WEEKDAY_NAMES[weekday]}垃圾車不會經過${place},此清運點的收運日固定在${nextDaysText}。`,
    `${place}今天(週${WEEKDAY_NAMES[weekday]})休收,下一個收運日請參考本頁時刻表(固定為${nextDaysText})。`,
  ];
  return pick(variants, seed + 1);
}

export function introSentence(point: CollectionPoint): string {
  const seed = stableHash(point.point_id);
  const scheduledDays = [...new Set(point.schedule.flatMap((s) => s.weekday))].sort((a, b) => a - b);
  const daysText = weekdayListText(scheduledDays);
  const times = point.schedule[0];
  if (!times) {
    return `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},目前尚無公開時刻資料。`;
  }
  const passThrough = isPassThrough(times, point.collection_type);
  const timeText = scheduleTimeText(times, point.collection_type);
  const variants = passThrough
    ? [
        `${point.address ?? point.point_name} 是${point.district}的沿街收運路段,垃圾車固定於${daysText} ${timeText},行進中不停等,請提前在路邊準備好垃圾。`,
        `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText}會${timeText},此處為沿街收運、車輛不會停留。`,
        `這是${point.district}${point.village ?? ''}的其中一個沿街收運路段,收運日固定在${daysText},垃圾車${timeText},請提早在路邊等候。`,
      ]
    : [
        `${point.address ?? point.point_name} 是${point.district}的定點垃圾清運點,固定於${daysText} ${timeText} 收運。`,
        `位於${point.village ?? point.district}的「${point.point_name}」清運點,垃圾車在${daysText}會於 ${timeText} 之間停靠。`,
        `這是${point.district}${point.village ?? ''}的其中一個定點清運站,收運時間固定在${daysText},每次停靠約 ${timeText}。`,
      ];
  return pick(variants, seed);
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaq(point: CollectionPoint, districtName: string): FaqItem[] {
  const seed = stableHash(point.point_id);

  const missedAnswers = [
    `若錯過${point.point_name}這班垃圾車,可攜帶垃圾至鄰近清運點(見本頁「鄰近清運點」區塊)在其收運時間內投放,或改於${districtName}清潔隊公告的其他收集地點處理,切勿任意棄置。`,
    `錯過時間的話,建議查看本頁列出的鄰近清運點是否還在收運時段內;若都已過站,只能等下一個收運日,或洽詢${districtName}清潔隊詢問臨時收運方式。`,
  ];

  const recycleAnswers = [
    `資源回收車通常與一般垃圾車同車次前來,停靠時間與本頁時刻表相同;可回收的紙類、瓶罐、塑膠請分類後交給隨車人員。`,
    `${districtName}的資源回收多與垃圾車同時段清運,依本頁時刻表的到站時間分類好紙類、寶特瓶、鐵鋁罐等交由清潔隊員即可。`,
  ];

  const bulkyAnswers = [
    `大型垃圾(家具、家電等)需另外向${point.city}環保局預約清運,不可直接放置在本清運點等候,以免影響巷道通行與被開罰。`,
    `大型廢棄物不在定點清運範圍內,需先上${point.city}環保局網站或電洽預約,由清潔隊安排另外時段到府收運。`,
  ];

  const kitchenAnswers = [
    `廚餘通常與一般垃圾同車次收運,請使用專用廚餘桶分裝生廚餘與熟廚餘,於垃圾車抵達時分開交付。`,
    `本點的廚餘收運時間與一般垃圾相同,請依生廚餘、熟廚餘分類後,在垃圾車抵達時交給清潔隊員。`,
  ];

  return [
    { question: '錯過這班垃圾車時間怎麼辦?', answer: pick(missedAnswers, seed) },
    { question: '資源回收車也是這個時間嗎?', answer: pick(recycleAnswers, seed + 1) },
    { question: '大型垃圾可以放在這裡等清運嗎?', answer: pick(bulkyAnswers, seed + 2) },
    { question: '廚餘要怎麼處理?', answer: pick(kitchenAnswers, seed + 3) },
  ];
}

export function districtNoteSentence(group: DistrictGroup): string {
  const seed = stableHash(group.districtSlug);
  const villageCount = new Set(group.points.map((p) => p.village).filter(Boolean)).size;
  const variants = [
    `${group.district}目前共有 ${group.points.length} 個定點清運點,分布在 ${villageCount} 個里,各點收運時間不同,請依下方列表或時段總表確認住家附近的班次。`,
    `${group.district}內共列出 ${group.points.length} 筆清運點資料,橫跨 ${villageCount} 個里;垃圾車路線與時間每點不同,建議先找到自家最近的清運點再查看時刻表。`,
  ];
  return pick(variants, seed);
}
