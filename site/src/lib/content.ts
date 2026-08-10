import type { CollectionPoint, DistrictGroup, DistrictStats, ScheduleEntry } from './data';
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

/**
 * collection_type 是官方標示的事實,是否為沿街收運只看這個欄位——不再額外要求 arrive===depart
 * (I3,2026-07-27 拍板,推翻先前的 arrive===depart 判準)。之前的判準以為沿街收運等於「到站即離站」
 * 的單一時刻,但台中 95% 的沿街收運點實際記錄的是 5–15 分鐘窗口(arrive≠depart),導致這些點被誤判
 * 成定點清運站措辭,見 DECISIONS.md。
 */
export function isPassThrough(collectionType: string | null): boolean {
  return collectionType === '沿街收運';
}

/** 沿街收運的時間片語:單一時刻用「約 X」,有時間窗口(如台中多筆記錄的 5–15 分鐘區間)用「約 X〜Y」(I3)。 */
function passThroughTimePhrase(entry: ScheduleEntry): string {
  return entry.arrive === entry.depart ? `約 ${entry.arrive}` : `約 ${entry.arrive}〜${entry.depart}`;
}

export function scheduleTimeText(entry: ScheduleEntry, collectionType: string | null): string {
  if (isPassThrough(collectionType)) return `${passThroughTimePhrase(entry)} 經過`;
  if (entry.depart === null) return `約 ${entry.arrive} 抵達`;
  return `${entry.arrive}〜${entry.depart}`;
}

export function todaySummarySentence(point: CollectionPoint, weekday: number = todayWeekdayTaipei()): string {
  const seed = stableHash(point.point_id);
  const place = point.point_name ?? '這個清運點';

  if (point.schedule.length === 0) {
    // I1(2026-07-27 拍板):純資源回收點(如 lagi2-002_C_5/C_6 兩條純回收路線,無一般垃圾班次)
    // 不得說「今天沒有收運」——這點本來就不提供一般垃圾清運服務,不是「今天休收」。
    const hasRecycling = !!point.recycling_schedule && point.recycling_schedule.length > 0;
    if (hasRecycling) {
      const recyclingVariants = [
        `${place}僅提供資源回收收運,無一般垃圾清運服務,回收到站時間請見下方時刻表。`,
        `本站僅取得${place}的資源回收班表,此點不提供一般垃圾清運,回收時間請參考下方時刻表。`,
      ];
      return pick(recyclingVariants, seed + 2);
    }
    // 2026-07-29 拍板:純廚餘點(schedule、recycling_schedule 皆空,僅 foodscraps_schedule
    // 非空)目前新北資料尚未實際出現(見 introSentence() 同一分支的註解),但比照該處補上,
    // 避免誤判成「本站尚未取得收運時刻資料」——該點其實有廚餘收運服務。
    const hasFoodscraps = !!point.foodscraps_schedule && point.foodscraps_schedule.length > 0;
    if (hasFoodscraps) {
      const foodscrapsVariants = [
        `${place}僅提供廚餘回收,無一般垃圾清運服務,到站時間請見下方時刻表。`,
        `本站僅取得${place}的廚餘回收班表,此點不提供一般垃圾清運,到站時間請參考下方時刻表。`,
      ];
      return pick(foodscrapsVariants, seed + 4);
    }
    // 理論上不會走到這裡(push_d1.py 已排除 schedule、recycling_schedule、foodscraps_schedule
    // 三者皆空的點),防禦性保留。
    return `本站尚未取得${place}的收運時刻資料。`;
  }

  const entry = todayScheduleEntry(point, weekday);

  if (entry) {
    const passThrough = isPassThrough(point.collection_type);
    // collection_type 未知(如桃園,來源無此欄位)時不得斷言「定點」,見 DECISIONS.md D3。
    const typeKnown = point.collection_type != null;
    const variants = passThrough
      ? [
          `今天(週${WEEKDAY_NAMES[weekday]})垃圾車${passThroughTimePhrase(entry)} 經過${place},此處為沿街收運、車輛不會停等,請提前在路邊等候。`,
          `today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}為沿街收運路段,垃圾車${passThroughTimePhrase(entry)} 經過,請提早把垃圾拿到路邊。`,
          `${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,垃圾車${passThroughTimePhrase(entry)} 經過此路段(沿街收運、不停留),建議提早 5 分鐘到路邊等候。`,
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
    //
    // 這句只負責「今天到底能不能判斷」的一句話總結,不重複 weekdayUnknownNotice()——
    // 那段(含官方查詢系統連結)已經在頁面正文的班表旁顯示一次,兩段擺在一起會讓使用者
    // 讀到兩次幾乎相同的「未取得星期,請以官方系統為準」(2026-07-27 修正,見 DECISIONS.md)。
    const unknownVariants = [
      `本站未取得${place}的收運星期資料,無法確認今天是否收運,到站時間請見下方時刻表。`,
      `${place}的收運星期本站尚未取得,到站時間請參考下方時刻表,詳細說明如下。`,
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
    // I1(2026-07-27 拍板):純資源回收點(schedule=[],如 lagi2-002_C_5/C_6 兩條純回收路線,
    // 共 98 點),不得沿用「目前尚無公開時刻資料」——這批點確實有資源回收服務,只是沒有
    // 一般垃圾班次,措辭需明講「僅提供資源回收」,不能誤導成完全沒有資料。
    const recyclingTimes = point.recycling_schedule?.[0];
    if (!recyclingTimes) {
      // 2026-07-29 拍板:純廚餘點(schedule、recycling_schedule 皆空,僅 foodscraps_schedule
      // 非空)目前新北資料尚未實際出現(現有 2 筆「僅資源回收+廚餘」點的 recycling_schedule
      // 皆非空,會在上面 recyclingTimes 分支被接住),但邏輯上不能排除未來資料出現這種形狀,
      // 見 B3 稽核(2026-07-29)發現的落差:原本這裡沒有 foodscraps 分支,會誤判成「完全無
      // 公開時刻資料」,但實際上該點有廚餘收運服務。
      const foodscrapsTimes = point.foodscraps_schedule?.[0];
      if (!foodscrapsTimes) {
        return `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},目前尚無公開時刻資料。`;
      }
      const foodscrapsDays = [...new Set(point.foodscraps_schedule!.flatMap((s) => s.weekday))].sort((a, b) => a - b);
      const foodscrapsArrival =
        foodscrapsTimes.depart === null
          ? `到站時間約 ${foodscrapsTimes.arrive}`
          : `到站時間約在 ${foodscrapsTimes.arrive}〜${foodscrapsTimes.depart} 之間`;
      if (foodscrapsDays.length === 0) {
        const foodscrapsUnknownVariants = [
          `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供廚餘回收,${foodscrapsArrival}。`,
          `位於${point.village ?? point.district}的「${point.point_name}」僅提供廚餘回收,${foodscrapsArrival}。`,
        ];
        return pick(foodscrapsUnknownVariants, seed);
      }
      const foodscrapsDaysText = weekdayListText(foodscrapsDays);
      const foodscrapsVaried = new Set(point.foodscraps_schedule!.map((s) => `${s.arrive}|${s.depart}`)).size > 1;
      if (foodscrapsVaried) {
        const foodscrapsVariedVariants = [
          `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供廚餘回收,固定於${foodscrapsDaysText}收運,不同星期的到站時間略有不同,詳見下方時刻表。`,
          `位於${point.village ?? point.district}的「${point.point_name}」僅提供廚餘回收,固定於${foodscrapsDaysText}收運,各星期到站時間不盡相同,詳見下方時刻表。`,
        ];
        return pick(foodscrapsVariedVariants, seed);
      }
      const foodscrapsVariants = [
        `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供廚餘回收,固定於${foodscrapsDaysText} ${foodscrapsArrival}。`,
        `位於${point.village ?? point.district}的「${point.point_name}」僅提供廚餘回收,固定於${foodscrapsDaysText} ${foodscrapsArrival}。`,
      ];
      return pick(foodscrapsVariants, seed);
    }
    const recyclingDays = [...new Set(point.recycling_schedule!.flatMap((s) => s.weekday))].sort((a, b) => a - b);
    const recyclingArrival =
      recyclingTimes.depart === null
        ? `到站時間約 ${recyclingTimes.arrive}`
        : `到站時間約在 ${recyclingTimes.arrive}〜${recyclingTimes.depart} 之間`;
    if (recyclingDays.length === 0) {
      const recyclingUnknownVariants = [
        `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供資源回收收運,${recyclingArrival}。`,
        `位於${point.village ?? point.district}的「${point.point_name}」僅提供資源回收收運,${recyclingArrival}。`,
      ];
      return pick(recyclingUnknownVariants, seed);
    }
    const recyclingDaysText = weekdayListText(recyclingDays);
    // 純回收點裡有 10 筆同樣有多個不同時段的 entry,套用與 I2 相同的「不承諾單一時間」規則,
    // 不能因為是新分支就重蹈 Bug A 的覆轍。
    const recyclingVaried = new Set(point.recycling_schedule!.map((s) => `${s.arrive}|${s.depart}`)).size > 1;
    if (recyclingVaried) {
      const recyclingVariedVariants = [
        `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供資源回收收運,固定於${recyclingDaysText}收運,不同星期的到站時間略有不同,詳見下方時刻表。`,
        `位於${point.village ?? point.district}的「${point.point_name}」僅提供資源回收收運,固定於${recyclingDaysText}收運,各星期到站時間不盡相同,詳見下方時刻表。`,
      ];
      return pick(recyclingVariedVariants, seed);
    }
    const recyclingVariants = [
      `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},此清運點僅提供資源回收收運,固定於${recyclingDaysText} ${recyclingArrival}。`,
      `位於${point.village ?? point.district}的「${point.point_name}」僅提供資源回收收運,固定於${recyclingDaysText} ${recyclingArrival}。`,
    ];
    return pick(recyclingVariants, seed);
  }
  const passThrough = isPassThrough(point.collection_type);
  const timeText = scheduleTimeText(times, point.collection_type);
  // collection_type 未知(如桃園,來源無此欄位)時不得斷言「定點」,見 DECISIONS.md D3。
  const typeKnown = point.collection_type != null;

  if (scheduledDays.length === 0) {
    // F1(2026-07-24 拍板,2026-07-24 二次拍板釐清分工):weekday 未知時不得套用固定星期的句型
    // (daysText 會是空字串,直接沿用下面模板會產生「固定於  10:00〜10:30 收運」這種語意不全的句子)。
    // 這個函式的輸出同時是 <meta description>(5,000+ 頁規模),不得塞免責聲明/官方連結文字——
    // 那類說明只放頁面正文(見 weekdayUnknownNotice(),在班表表格旁顯示),這裡維持乾淨的單句敘述。
    //
    // 注意:此處不可直接沿用 scheduleTimeText() 的回傳值套進「到站時間約 ...」這種外層片語——
    // scheduleTimeText() 對 depart===null / passThrough 的情況本身就已回傳「約 X 抵達/經過」的完整片語,
    // 外層再包一層「到站時間約」會疊字重複(如「到站時間約 約 17:00 抵達」)。這裡改成依三種情境
    // (經過/抵達/區間)各自組出通順的單句,不重用 scheduleTimeText() 的輸出(2026-07-27 修正,見 DECISIONS.md)。
    const arrivalPhrase = passThrough
      ? `${passThroughTimePhrase(times)} 經過`
      : times.depart === null
        ? `到站時間約 ${times.arrive}`
        : `到站時間約在 ${times.arrive}〜${times.depart} 之間`;
    const unknownVariants = [
      `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},垃圾車${arrivalPhrase}。`,
      `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車${arrivalPhrase}。`,
      `這是${point.district}${point.village ?? ''}的其中一個清運點,垃圾車${arrivalPhrase}。`,
    ];
    return pick(unknownVariants, seed);
  }

  const daysText = weekdayListText(scheduledDays);
  const timeShapesVaried = new Set(point.schedule.map((s) => `${s.arrive}|${s.depart}`)).size > 1;
  if (timeShapesVaried) {
    // I2(2026-07-27 拍板):多個 entry 且時間不同時,不能只引用 schedule[0] 的時間卻聲稱對整個
    // 聯集星期都適用——那對其餘星期是事實錯誤(範例:TYN-LUZHU-33C4F756E7,週一/四實際到站
    // 時間是 17:30,若沿用單一時間句型會誤寫成 17:25,且這句話會進 meta description 被索引,
    // 見 DECISIONS.md)。星期本身沒有問題(聯集正確),放棄的只是「單一時間」這個過度精簡的
    // 承諾,交給下方逐列的時刻表呈現正確細節。規模:高雄 1,078、台中 3,664、桃園 1,470 筆。
    const variedVariants = [
      `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ''},垃圾車在${daysText}收運,不同星期的到站時間略有不同,詳見下方時刻表。`,
      `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText}收運,各星期到站時間不盡相同,詳細時段請見下方時刻表。`,
      `這是${point.district}${point.village ?? ''}的其中一個清運點,收運日固定在${daysText},但不同星期到站時間略有不同,詳見下方時刻表。`,
    ];
    return pick(variedVariants, seed);
  }
  const variants = passThrough
    ? [
        `${point.address ?? point.point_name} 是${point.district}的沿街收運路段,垃圾車固定於${daysText} ${timeText},行進中不停等,請提前在路邊準備好垃圾。`,
        `位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText} ${timeText},此處為沿街收運、車輛不會停留。`,
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

function daysLabel(days: number[]): string {
  return days.map((d) => `週${WEEKDAY_NAMES[d]}`).join('、');
}

/**
 * 星期分佈的口語化摘要:多數星期點數相近時合併成一句話(差異用「約 X–Y 個點」帶過),
 * 明顯偏低(含 0)的星期才逐一點名——2026-08-10 Jun 審查三民區範例後指出逐日列出 7 個
 * 數字太冗長,改成這種「多數/例外」分組方式。以最高星期點數的一半為門檻切分「多數」
 * 與「偏低」兩組,純粹依資料算出,不套用「早班/晚班」之類自訂標籤。
 * 呼叫端需自行保證至少有一個星期有已知班次,否則回傳 null(maxCount===0 時)。
 */
export function weekdaySummarySentence(stats: DistrictStats): string | null {
  const counts = stats.weekdayScheduleCounts;
  const maxCount = Math.max(...counts.slice(1, 8));
  if (maxCount === 0) return null;
  const threshold = maxCount / 2;

  const normalDays: number[] = [];
  const reducedDays: number[] = [];
  for (let d = 1; d <= 7; d++) {
    (counts[d] >= threshold ? normalDays : reducedDays).push(d);
  }

  const normalCounts = normalDays.map((d) => counts[d]);
  const normalMin = Math.min(...normalCounts);
  const normalMax = Math.max(...normalCounts);
  const normalText =
    normalMin === normalMax
      ? `${daysLabel(normalDays)} ${normalMin} 個點有班次`
      : `${daysLabel(normalDays)}約 ${normalMin}–${normalMax} 個點有班次`;

  if (reducedDays.length === 0) return `${normalText}。`;

  const zeroDays = reducedDays.filter((d) => counts[d] === 0);
  const lowDays = reducedDays.filter((d) => counts[d] > 0);

  const parts = [normalText];
  if (lowDays.length > 0) {
    parts.push(lowDays.map((d) => `週${WEEKDAY_NAMES[d]}僅 ${counts[d]} 個點`).join('、'));
  }
  if (zeroDays.length > 0) {
    parts.push(`${daysLabel(zeroDays)}目前沒有登記的收運班次`);
  }
  return `${parts.join(';')}。`;
}

/**
 * 區級 FAQ,4 題固定順序,每題答不出來(資料不支援)就從陣列中整項省略,不硬答、
 * 不寫「通常」「一般來說」這類沒有依據的措辭——所有答案都可回溯到 DistrictStats 的計算結果。
 */
export function buildDistrictFaq(group: DistrictGroup, stats: DistrictStats): FaqItem[] {
  const items: FaqItem[] = [];

  // Q1:僅在至少有一個點知道星期時才回答;weekdaySummarySentence 在全區星期皆未知時
  // 回傳 null,改用誠實版本,不得假裝「每天都算出 0」。
  const scheduledPointCount = stats.pointCount - stats.noSchedulePointCount;
  if (scheduledPointCount > 0) {
    const summary = weekdaySummarySentence(stats);
    const answer =
      summary === null
        ? `本站尚未取得${group.district}清運點的逐日收運星期資料,僅取得到站時間,請見下方時段總表。`
        : `根據本站資料,${group.district}${summary}`;
    items.push({ question: `${group.district}星期幾有收垃圾?`, answer });
  }

  // Q2:永遠可答(group 非空由呼叫端保證)。
  items.push({
    question: `${group.district}有幾個清運點?`,
    answer: `${group.district}目前共登記 ${stats.pointCount} 個清運點,分布在 ${stats.villageCount} 個里。`,
  });

  // Q3:earliestArrive/latestArrive 皆為 null(全區無 schedule 資料)時整題省略。
  if (stats.earliestArrive !== null && stats.latestArrive !== null) {
    items.push({
      question: `${group.district}最早、最晚的清運時間是幾點?`,
      answer: `${group.district}記錄到的清運到站時間中,最早為 ${stats.earliestArrive},最晚為 ${stats.latestArrive}。`,
    });
  }

  // Q4:recyclingPointCount/foodscrapsPointCount 皆為 0 時整題省略;僅其中一項 >0 時只講該項,
  // 不特別註明「未取得另一項資料」——單純數字,不做解釋。
  const segments: string[] = [];
  if (stats.recyclingPointCount > 0) {
    segments.push(`有 ${stats.recyclingPointCount} 個(約 ${stats.recyclingCoveragePct}%)提供資源回收`);
  }
  if (stats.foodscrapsPointCount > 0) {
    segments.push(`有 ${stats.foodscrapsPointCount} 個(約 ${stats.foodscrapsCoveragePct}%)提供廚餘回收`);
  }
  if (segments.length > 0) {
    items.push({
      question: `${group.district}有資源回收或廚餘回收嗎?`,
      answer: `${group.district}的清運點中,${segments.join('、')}。`,
    });
  }

  return items;
}

/** 星期分佈總覽表格旁的補充說明(未知星期/純回收廚餘點各自的排除說明),無需說明時回傳 null。 */
export function weekdayDistributionCaveat(stats: DistrictStats): string | null {
  const parts: string[] = [];
  if (stats.weekdayUnknownPointCount > 0) {
    parts.push(
      `另有 ${stats.weekdayUnknownPointCount} 個點的收運星期本站尚未取得,未列入以上統計(到站時間仍列在下方時段總表中)`
    );
  }
  if (stats.noSchedulePointCount > 0) {
    parts.push(
      `另有 ${stats.noSchedulePointCount} 個點僅提供資源回收或廚餘回收服務,無一般垃圾收運班次,未列入以上統計`
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join(';')}。`;
}

/**
 * 時段分佈段落:最早/最晚到站時間 + 集中時段。maxCount<=1 或並列超過 3 個小時時代表班次太分散,
 * 談不上「集中」,不硬套此句型(避免灌水)。earliestArrive 為 null(全區無 schedule 資料)時回傳 null,
 * 呼叫端整段不渲染。
 */
export function districtTimeDistributionSentence(stats: DistrictStats): string | null {
  if (stats.earliestArrive === null || stats.latestArrive === null) return null;
  const rangeText =
    stats.earliestArrive === stats.latestArrive
      ? `全區到站時間集中在 ${stats.earliestArrive}`
      : `全區到站時間最早 ${stats.earliestArrive},最晚 ${stats.latestArrive}`;

  const maxCount = Math.max(...stats.hourCounts);
  const peakHours = stats.hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count === maxCount)
    .map((h) => h.hour);
  const peakText =
    maxCount > 1 && peakHours.length <= 3
      ? `,收運時段以 ${peakHours.map((h) => `${h}時`).join('、')} 最為集中(共 ${maxCount} 筆班次)`
      : '';

  return `${rangeText}${peakText}。`;
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
