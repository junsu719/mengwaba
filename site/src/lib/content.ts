import type { CollectionPoint, DistrictGroup, ScheduleEntry } from './data';
import { WEEKDAY_NAMES, todayScheduleEntry, todayWeekdayTaipei } from './data';

interface OfficialQuerySystem {
  name: string;
  url: string;
}

/**
 * 部分縣市除了開放資料平台(CityInfo.sourceUrl,標示資料集出處用)外,另有獨立維護的
 * 即時查詢系統,是 weekday 未知時「請以官方系統為準」文案要連的對象。目前僅桃園有此需求,
 * 見 DECISIONS.md F1(2026-07-24)、pipeline/fetch_taoyuan_raw.py 開頭註解。
 */
const OFFICIAL_QUERY_SYSTEMS: Record<string, OfficialQuerySystem> = {
  桃園市: { name: '桃園市環境管理處「垃圾清運路線即時查詢系統」', url: 'https://route.tyoem.gov.tw/' },
};

export function officialQuerySystem(point: CollectionPoint): OfficialQuerySystem | null {
  return OFFICIAL_QUERY_SYSTEMS[point.city] ?? null;
}

function querySystemText(point: CollectionPoint): string {
  return officialQuerySystem(point)?.name ?? '官方查詢系統';
}

/**
 * F1 文案(2026-07-24 Jun 定稿版本 B,2026-07-24 二次拍板拿掉「不顯示星期標籤」這種談自家 UI 的話):
 * 只用在頁面正文(班表表格旁),不得放進 meta description——見 introSentence() 的分工說明。
 */
export function weekdayUnknownNotice(point: CollectionPoint, label: string = '收運'): string {
  return `本站僅取得此清運點的到點時間,未取得${label}星期。完整班表請以${querySystemText(point)}為準。`;
}

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
export function isPassThrough(entry: ScheduleEntry, collectionType: string | null): boolean {
  return collectionType === '沿街收運' && entry.arrive === entry.depart;
}

export function scheduleTimeText(entry: ScheduleEntry, collectionType: string | null): string {
  if (isPassThrough(entry, collectionType)) return `約 ${entry.arrive} 經過`;
  if (entry.depart === null) return `約 ${entry.arrive} 抵達`;
  return `${entry.arrive}〜${entry.depart}`;
}

export function todaySummarySentence(point: CollectionPoint): string {
  const weekday = todayWeekdayTaipei();
  const entry = todayScheduleEntry(point, weekday);
  const seed = stableHash(point.point_id);
  const place = point.point_name ?? '這個清運點';

  if (entry) {
    const passThrough = isPassThrough(entry, point.collection_type);
    // collection_type 未知(如桃園,來源無此欄位)時不得斷言「定點」,見 DECISIONS.md D3。
    const typeKnown = point.collection_type != null;
    const variants = passThrough
      ? [
          `今天(週${WEEKDAY_NAMES[weekday]})垃圾車約 ${entry.arrive} 經過${place},此處為沿街收運、車輛不會停等,請提前在路邊等候。`,
          `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}為沿街收運路段,垃圾車約 ${entry.arrive} 經過,請提早把垃圾拿到路邊。`,
          `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,垃圾車約 ${entry.arrive} 經過此路段(沿街收運、不停留),建議提早 5 分鐘到路邊等候。`,
        ]
      : entry.depart === null
        ? typeKnown
          ? [
              `今天(週${WEEKDAY_NAMES[weekday]})垃圾車會來${place},預計 ${entry.arrive} 抵達,請提前將垃圾拿到定點等候。`,
              `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}有清運班次,清運車預計 ${entry.arrive} 抵達,別錯過。`,
              `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,預計 ${entry.arrive} 抵達,建議提早 5 分鐘到定點等候。`,
            ]
          : [
              `今天(週${WEEKDAY_NAMES[weekday]})垃圾車會到${place},預計 ${entry.arrive} 抵達,請提前將垃圾拿到現場等候。`,
              `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}有清運班次,清運車預計 ${entry.arrive} 抵達,別錯過。`,
              `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,預計 ${entry.arrive} 抵達,建議提早 5 分鐘到場等候。`,
            ]
        : [
            `今天(週${WEEKDAY_NAMES[weekday]})垃圾車會來${place},預計 ${entry.arrive}〜${entry.depart} 停靠,請提前在時間內將垃圾拿到定點。`,
            `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}有清運班次,清運車抵達時間約 ${entry.arrive} 至 ${entry.depart},別錯過。`,
            `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,時間落在 ${entry.arrive}〜${entry.depart} 之間,建議提早 5 分鐘到定點等候。`,
          ];
    return pick(variants, seed).replace('today-yes: ', '');
  }

  const scheduledDays = [...new Set(point.schedule.flatMap((s) => s.weekday))].sort((a, b) => a - b);
  if (scheduledDays.length === 0) {
    // F1(2026-07-24 拍板):weekday 未知時,todayScheduleEntry 必定找不到今天的班次,
    // 但這不代表「今天沒收運」——不得沿用下面的「休收」句型,見 DECISIONS.md。
    const unknownVariants = [
      `本站未取得${place}的收運星期資料,無法判斷今天是否收運,請以${querySystemText(point)}查詢完整班表(到站時間見下方時刻表)。`,
      `${place}的收運星期本站尚未取得,今天是否收運請以${querySystemText(point)}為準,本頁僅能提供到站時間。`,
    ];
    return pick(unknownVariants, seed + 1);
  }
  const nextDaysText = weekdayListText(scheduledDays);
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
  const times = point.schedule[0];
  if (!times) {
    return `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},目前尚無公開時刻資料。`;
  }
  const passThrough = isPassThrough(times, point.collection_type);
  const timeText = scheduleTimeText(times, point.collection_type);
  // collection_type 未知(如桃園,來源無此欄位)時不得斷言「定點」,見 DECISIONS.md D3。
  const typeKnown = point.collection_type != null;

  if (scheduledDays.length === 0) {
    // F1(2026-07-24 拍板,2026-07-24 二次拍板釐清分工):weekday 未知時不得套用固定星期的句型
    // (daysText 會是空字串,直接沿用下面模板會產生「固定於  10:00〜10:30 收運」這種語意不全的句子)。
    // 這個函式的輸出同時是 <meta description>(5,000+ 頁規模),不得塞免責聲明/官方連結文字——
    // 那類說明只放頁面正文(見 weekdayUnknownNotice(),在班表表格旁顯示),這裡維持乾淨的單句敘述。
    const unknownVariants = [
      `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},垃圾車到站時間約 ${timeText}。`,
      `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車到站時間約 ${timeText}。`,
      `這是${point.district}${point.village ?? ''}的其中一個清運點,垃圾車到站時間約 ${timeText}。`,
    ];
    return pick(unknownVariants, seed);
  }

  const daysText = weekdayListText(scheduledDays);
  const variants = passThrough
    ? [
        `${point.address ?? point.point_name} 是${point.district}的沿街收運路段,垃圾車固定於${daysText} ${timeText},行進中不停等,請提前在路邊準備好垃圾。`,
        `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText}會${timeText},此處為沿街收運、車輛不會停留。`,
        `這是${point.district}${point.village ?? ''}的其中一個沿街收運路段,收運日固定在${daysText},垃圾車${timeText},請提早在路邊等候。`,
      ]
    : typeKnown
      ? [
          `${point.address ?? point.point_name} 是${point.district}的定點垃圾清運點,固定於${daysText} ${timeText} 收運。`,
          `位於${point.village ?? point.district}的「${point.point_name}」清運點,垃圾車在${daysText}會於 ${timeText} 之間停靠。`,
          `這是${point.district}${point.village ?? ''}的其中一個定點清運站,收運時間固定在${daysText},每次停靠約 ${timeText}。`,
        ]
      : [
          `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},垃圾車固定於${daysText} ${timeText}。`,
          `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText} ${timeText}。`,
          `這是${point.district}${point.village ?? ''}的其中一個清運點,收運日固定在${daysText},垃圾車${timeText}。`,
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
