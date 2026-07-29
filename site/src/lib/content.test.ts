import { describe, expect, it } from 'vitest';
import type { CollectionPoint } from './data';
import { introSentence, scheduleTimeText, todaySummarySentence } from './content';

/**
 * ⚠️ Golden/snapshot 測試 —— 這些字串是 2026-07-27 由 Jun 人工逐句讀過、確認正確的輸出
 * (見 I4「重跑組合矩陣並人工讀過」的結果)。這份檔案鎖住「同一種資料形狀應該長出同一種
 * 句子」,任何導致這裡失敗的改動,不論是文案調整還是邏輯修正,**修改前都必須把新輸出
 * 重新貼出來給 Jun 人工審閱過一輪,確認新句子讀起來通順、沒有疊字/殘缺句/事實錯誤,
 * 才能更新這裡的期望值**——不得因為測試失敗就直接把新輸出貼進來讓測試通過,那樣會讓
 * golden test 形同虛設(它存在的目的就是逼一次人工複核,不是被動配合程式輸出)。
 *
 * 全部用寫死的 fixture,不讀 data/normalized/*.json——那份資料每季手動更新一次,
 * 若測試直接讀活資料,下一季換資料就會產生跟程式碼改動無關的假失敗。這裡的 fixture
 * 是從實際資料摘錄下來的真實形狀(見各筆註解的 point_id 出處與所屬組合矩陣分類 A–J,
 * 對應 I4 的分類),固定下來只為了鎖住行為,不是要驗證資料本身。
 *
 * 組合矩陣分類(I4,2026-07-27;K–P 為 2026-07-29 新北 foodscraps_schedule 擴充新增,
 * 見 B4/B5 稽核,DECISIONS.md 2026-07-29):
 *   A 星期已知×depart有值  B 星期已知×depart null(多時段/Bug A)  C 星期未知×depart null
 *   D/E 有/無 recycling_schedule  G I1 純資源回收點  H I2 單一時段 vs 多時段
 *   I I3 沿街收運 arrive=depart vs arrive≠depart  J I2+I3 共同案例
 *   K 有 foodscraps_schedule,星期為一般垃圾子集(新北最常見型態,26,209 筆)
 *   L 有 foodscraps_schedule,多出的星期由 recycling_schedule 涵蓋、到站時間一致(333 筆)
 *   M 有 foodscraps_schedule,多出的星期在 schedule/recycling_schedule 皆查無對應(20 筆孤立點)
 *   N 無 foodscraps_schedule——回歸測試,確認新增欄位不影響既有輸出(107 筆)
 *   O foodscraps_schedule 非空但 schedule 為空、recycling_schedule 非空(僅回收+廚餘,2 筆)
 *   P 合成防禦性測試:schedule 與 recycling_schedule 皆空、僅 foodscraps_schedule 非空
 *     ——目前新北資料尚未出現此形狀,但 B3 稽核發現原本的程式碼會誤判成「完全無公開時刻
 *     資料」,2026-07-29 已修正 introSentence()/todaySummarySentence() 補上對應分支
 */

function point(overrides: Partial<CollectionPoint>): CollectionPoint {
  return {
    point_id: 'TEST-0000000000',
    city: '測試市',
    district: '測試區',
    village: '測試里',
    point_name: '測試路一段1號',
    address: '測試市測試區測試路一段1號',
    lat: null,
    lng: null,
    schedule: [],
    recycling_schedule: undefined,
    collection_type: null,
    notes: null,
    source: 'test',
    fetched_at: 'test',
    ...overrides,
  };
}

describe('scheduleTimeText', () => {
  it('定點清運,arrive/depart 皆有值 → 區間', () => {
    expect(scheduleTimeText({ weekday: [1], arrive: '16:25', depart: '16:29' }, '定點清運')).toBe('16:25〜16:29');
  });

  it('depart 為 null(桃園常見形狀) → 約 X 抵達', () => {
    expect(scheduleTimeText({ weekday: [1], arrive: '17:00', depart: null }, null)).toBe('約 17:00 抵達');
  });

  it('沿街收運且 arrive===depart(單一時刻) → 約 X 經過', () => {
    expect(scheduleTimeText({ weekday: [1], arrive: '15:25', depart: '15:25' }, '沿街收運')).toBe('約 15:25 經過');
  });

  it('I3:沿街收運但有時間窗口(台中 95% 的實際形狀) → 約 X〜Y 經過', () => {
    expect(scheduleTimeText({ weekday: [1], arrive: '18:55', depart: '19:00' }, '沿街收運')).toBe('約 18:55〜19:00 經過');
  });
});

describe('introSentence(meta description)', () => {
  it('A1 高雄:星期已知、depart 有值、定點清運、單一時段(KHH-SANMIN-5B3D524957)', () => {
    const p = point({
      point_id: 'KHH-SANMIN-5B3D524957',
      city: '高雄市',
      district: '三民區',
      village: '安吉里',
      point_name: '九如一路952號(堯山街口)',
      address: null,
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '16:25', depart: '16:29' }],
      recycling_schedule: [{ weekday: [2, 5], arrive: '16:25', depart: '16:29' }],
      collection_type: '定點清運',
    });
    expect(introSentence(p)).toBe('這是三民區安吉里的其中一個定點清運站,收運時間固定在週一、週二、週四、週五、週六,每次停靠約 16:25〜16:29。');
  });

  it('A2/I3 台中:沿街收運、arrive=depart 單一時刻(TXG-ZHONGQU-FE545D286E)', () => {
    const p = point({
      point_id: 'TXG-ZHONGQU-FE545D286E',
      city: '臺中市',
      district: '中區',
      village: '中華里',
      point_name: '中華路一段143號',
      address: null,
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '15:25', depart: '15:25' }],
      collection_type: '沿街收運',
    });
    expect(introSentence(p)).toBe(
      '位於中華里的「中華路一段143號」,垃圾車在週一、週二、週四、週五、週六 約 15:25 經過,此處為沿街收運、車輛不會停留。'
    );
  });

  it('B1 桃園:星期已知、depart null、多時段時間不同(TYN-LUZHU-33C4F756E7,Bug A 範例)——不再誤講單一時間', () => {
    const p = point({
      point_id: 'TYN-LUZHU-33C4F756E7',
      city: '桃園市',
      district: '蘆竹區',
      village: '蘆竹里',
      point_name: '南崁路二段483號(富國路三段交叉口)',
      address: null,
      schedule: [
        { weekday: [2, 5, 6], arrive: '17:25', depart: null },
        { weekday: [1, 4], arrive: '17:30', depart: null },
      ],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '位於蘆竹里的「南崁路二段483號(富國路三段交叉口)」,垃圾車在週一、週二、週四、週五、週六收運,各星期到站時間不盡相同,詳細時段請見下方時刻表。'
    );
  });

  it('C1 桃園:星期未知、depart null、無 recycling_schedule(TYN-ZHONGLI-FEAA70BB71)', () => {
    const p = point({
      point_id: 'TYN-ZHONGLI-FEAA70BB71',
      city: '桃園市',
      district: '中壢區',
      village: '篤行里',
      point_name: '興仁路二段663號對面',
      address: '桃園市中壢區興仁路二段663號對面',
      schedule: [{ weekday: [], arrive: '07:00', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe('桃園市中壢區興仁路二段663號對面 位於中壢區篤行里,垃圾車到站時間約 07:00。');
  });

  it('D1 桃園:收運日與回收日皆未知(TYN-LUZHU-EF5C55FA0C,H1 修正)——無疊字', () => {
    const p = point({
      point_id: 'TYN-LUZHU-EF5C55FA0C',
      city: '桃園市',
      district: '蘆竹區',
      village: '長興里',
      point_name: '長興路四段12號',
      address: '桃園市蘆竹區長興路四段12號',
      schedule: [{ weekday: [], arrive: '17:00', depart: null }],
      recycling_schedule: [{ weekday: [], arrive: '17:00', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe('這是蘆竹區長興里的其中一個清運點,垃圾車到站時間約 17:00。');
  });

  it('E1 高雄:無 recycling_schedule(KHH-SANMIN-DE02452895)', () => {
    const p = point({
      point_id: 'KHH-SANMIN-DE02452895',
      city: '高雄市',
      district: '三民區',
      village: '本館里',
      point_name: '建工市場(昌裕街161號)',
      address: null,
      schedule: [{ weekday: [1, 2, 3, 4, 5, 6, 7], arrive: '13:00', depart: '13:20' }],
      collection_type: '定點清運',
    });
    expect(introSentence(p)).toBe(
      '位於本館里的「建工市場(昌裕街161號)」清運點,垃圾車在週一、週二、週三、週四、週五、週六、週日會於 13:00〜13:20 之間停靠。'
    );
  });

  it('E2 台中:無 recycling_schedule(TXG-ZHONGQU-7938D47BEC)', () => {
    const p = point({
      point_id: 'TXG-ZHONGQU-7938D47BEC',
      city: '臺中市',
      district: '中區',
      village: '中華里',
      point_name: '中山路321號(中華路一段與中山路口)',
      address: '臺中市中區中山路321號(中華路一段與中山路口)',
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '07:12', depart: '07:20' }],
      collection_type: '定點清運',
    });
    expect(introSentence(p)).toBe('臺中市中區中山路321號(中華路一段與中山路口) 是中區的定點垃圾清運點,固定於週一、週二、週四、週五、週六 07:12〜07:20 收運。');
  });

  it('E3 桃園:無 recycling_schedule、無村里(TYN-LUZHU-78579122C5)', () => {
    const p = point({
      point_id: 'TYN-LUZHU-78579122C5',
      city: '桃園市',
      district: '蘆竹區',
      village: null,
      point_name: '向日葵',
      address: null,
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '07:40', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe('這是蘆竹區的其中一個清運點,收運日固定在週一、週二、週四、週五、週六,垃圾車約 07:40 抵達。');
  });

  it('G1 I1:純資源回收點、單一時段(TYN-BADE-E675ED971B,無一般垃圾班次)', () => {
    const p = point({
      point_id: 'TYN-BADE-E675ED971B',
      city: '桃園市',
      district: '八德區',
      village: null,
      point_name: '雅典桂冠',
      address: '桃園市八德區雅典桂冠',
      schedule: [],
      recycling_schedule: [{ weekday: [1, 4, 6], arrive: '07:55', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe('桃園市八德區雅典桂冠 位於八德區,此清運點僅提供資源回收收運,固定於週一、週四、週六 到站時間約 07:55。');
  });

  it('G2 I1:純資源回收點、多時段時間不同(TYN-BADE-25805EE562)——套用與 I2 相同的規則', () => {
    const p = point({
      point_id: 'TYN-BADE-25805EE562',
      city: '桃園市',
      district: '八德區',
      village: null,
      point_name: '富麗前程',
      address: '桃園市八德區富麗前程',
      schedule: [],
      recycling_schedule: [
        { weekday: [1], arrive: '08:25', depart: null },
        { weekday: [4], arrive: '08:45', depart: null },
        { weekday: [6], arrive: '09:32', depart: null },
      ],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '桃園市八德區富麗前程 位於八德區,此清運點僅提供資源回收收運,固定於週一、週四、週六收運,不同星期的到站時間略有不同,詳見下方時刻表。'
    );
  });

  it('完全無資料(schedule 與 recycling_schedule 皆空)——防禦性分支,理論上不會實際出現於已上線頁面', () => {
    const p = point({ point_id: 'TEST-EMPTY', schedule: [], recycling_schedule: undefined });
    expect(introSentence(p)).toBe('測試市測試區測試路一段1號 位於測試區測試里,目前尚無公開時刻資料。');
  });

  it('H2 I2:高雄多時段時間不同、定點清運(KHH-SANMIN-AD43FBD41E)——排除沿街收運干擾,單純驗 I2', () => {
    const p = point({
      point_id: 'KHH-SANMIN-AD43FBD41E',
      city: '高雄市',
      district: '三民區',
      village: '安宜里',
      point_name: '唐山街1號',
      address: null,
      schedule: [
        { weekday: [1], arrive: '19:27', depart: '19:29' },
        { weekday: [2, 4, 5, 6], arrive: '19:27', depart: '19:27' },
      ],
      recycling_schedule: [{ weekday: [1, 4], arrive: '19:27', depart: '19:27' }],
      collection_type: '定點清運',
    });
    expect(introSentence(p)).toBe('這是三民區安宜里的其中一個清運點,收運日固定在週一、週二、週四、週五、週六,但不同星期到站時間略有不同,詳見下方時刻表。');
  });

  it('H3 I2:台中多時段時間不同、定點清運(TXG-ZHONGQU-2452161A66)', () => {
    const p = point({
      point_id: 'TXG-ZHONGQU-2452161A66',
      city: '臺中市',
      district: '中區',
      village: '柳川里',
      point_name: '公園路30號',
      address: '臺中市中區公園路30號',
      schedule: [
        { weekday: [1, 4], arrive: '16:30', depart: '16:35' },
        { weekday: [2, 5, 6], arrive: '16:15', depart: '16:20' },
      ],
      recycling_schedule: [
        { weekday: [1], arrive: '16:20', depart: '16:20' },
        { weekday: [4, 6], arrive: '16:15', depart: '16:20' },
      ],
      collection_type: '定點清運',
    });
    expect(introSentence(p)).toBe('臺中市中區公園路30號 位於中區柳川里,垃圾車在週一、週二、週四、週五、週六收運,不同星期的到站時間略有不同,詳見下方時刻表。');
  });

  it('I1 I3:高雄沿街收運、arrive=depart(KHH-TAOYUAN-81C2542528)——I3 前後行為不變(基準對照組)', () => {
    const p = point({
      point_id: 'KHH-TAOYUAN-81C2542528',
      city: '高雄市',
      district: '桃源區',
      village: '寶山里',
      point_name: '第一鄰的T字路口',
      address: '高雄市桃源區第一鄰的T字路口',
      schedule: [{ weekday: [1, 5], arrive: '15:05', depart: '15:05' }],
      recycling_schedule: [{ weekday: [1, 5], arrive: '15:05', depart: '15:05' }],
      collection_type: '沿街收運',
    });
    expect(introSentence(p)).toBe('高雄市桃源區第一鄰的T字路口 是桃源區的沿街收運路段,垃圾車固定於週一、週五 約 15:05 經過,行進中不停等,請提前在路邊準備好垃圾。');
  });

  it('I2 I3:高雄沿街收運、arrive≠depart 時間窗口(KHH-TAOYUAN-94EE72889B)——修正前會誤判成定點清運', () => {
    const p = point({
      point_id: 'KHH-TAOYUAN-94EE72889B',
      city: '高雄市',
      district: '桃源區',
      village: '桃源里',
      point_name: '張志誠家前',
      address: null,
      schedule: [{ weekday: [1, 3, 5], arrive: '15:05', depart: '15:07' }],
      recycling_schedule: [{ weekday: [1, 3, 5], arrive: '15:05', depart: '15:07' }],
      collection_type: '沿街收運',
    });
    expect(introSentence(p)).toBe('這是桃源區桃源里的其中一個沿街收運路段,收運日固定在週一、週三、週五,垃圾車約 15:05〜15:07 經過,請提早在路邊等候。');
  });

  it('I4 I3:台中沿街收運、arrive≠depart 時間窗口(TXG-ZHONGQU-F79A387235,佔台中沿街收運點 95%)', () => {
    const p = point({
      point_id: 'TXG-ZHONGQU-F79A387235',
      city: '臺中市',
      district: '中區',
      village: null,
      point_name: '民族路78號',
      address: '臺中市中區民族路78號',
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:55', depart: '19:00' }],
      collection_type: '沿街收運',
    });
    expect(introSentence(p)).toBe(
      '臺中市中區民族路78號 是中區的沿街收運路段,垃圾車固定於週一、週二、週四、週五、週六 約 18:55〜19:00 經過,行進中不停等,請提前在路邊準備好垃圾。'
    );
  });

  it('J1 I2+I3:台中多時段且沿街收運形狀不一致(TXG-ZHONGQU-8C508686AB,原始 Bug A/B 案發範例)', () => {
    const p = point({
      point_id: 'TXG-ZHONGQU-8C508686AB',
      city: '臺中市',
      district: '中區',
      village: '光復里',
      point_name: '光復路119號(豪華戲院前)',
      address: '臺中市中區光復路119號(豪華戲院前)',
      schedule: [
        { weekday: [1, 4, 6], arrive: '14:15', depart: '14:25' },
        { weekday: [2, 5], arrive: '14:25', depart: '14:25' },
      ],
      recycling_schedule: [{ weekday: [1, 4, 6], arrive: '14:25', depart: '14:25' }],
      collection_type: '沿街收運',
      notes: '車牌312-UX',
    });
    expect(introSentence(p)).toBe(
      '位於光復里的「光復路119號(豪華戲院前)」,垃圾車在週一、週二、週四、週五、週六收運,各星期到站時間不盡相同,詳細時段請見下方時刻表。'
    );
  });

  it('K:新北 foodscraps_schedule 為一般垃圾子集(XBC-WANLI-8EAAE1E23D)——introSentence 不受 foodscraps 欄位影響', () => {
    const p = point({
      point_id: 'XBC-WANLI-8EAAE1E23D',
      city: '新北市',
      district: '萬里區',
      village: '瑪鋉里',
      point_name: '瑪鋉路30巷2弄4號',
      address: '新北市萬里區瑪鋉路30巷2弄4號',
      schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:17', depart: null }],
      recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:17', depart: null }],
      foodscraps_schedule: [{ weekday: [1, 2, 5, 6], arrive: '19:17', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '新北市萬里區瑪鋉路30巷2弄4號 位於萬里區瑪鋉里,垃圾車固定於週一、週二、週四、週五、週六 約 19:17 抵達。'
    );
  });

  it('L:新北 foodscraps_schedule 多出的星期由 recycling_schedule 涵蓋(XBC-WANLI-9FA3B36F8E)', () => {
    const p = point({
      point_id: 'XBC-WANLI-9FA3B36F8E',
      city: '新北市',
      district: '萬里區',
      village: '萬里里',
      point_name: '獅頭路2號巷口',
      address: '新北市萬里區獅頭路2號巷口',
      schedule: [{ weekday: [2, 4, 5, 6], arrive: '18:38', depart: null }],
      recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:38', depart: null }],
      foodscraps_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:38', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '新北市萬里區獅頭路2號巷口 位於萬里區萬里里,垃圾車固定於週二、週四、週五、週六 約 18:38 抵達。'
    );
  });

  it('M:新北 foodscraps_schedule 多出的星期查無任何對應(XBC-WULAI-73594FD90B,20 筆孤立點之一)', () => {
    const p = point({
      point_id: 'XBC-WULAI-73594FD90B',
      city: '新北市',
      district: '烏來區',
      village: '忠治里',
      point_name: '忠治產道沿線清運(每周2.6)',
      address: '新北市烏來區忠治產道沿線清運(每周2.6)',
      schedule: [{ weekday: [1, 6], arrive: '19:25', depart: null }],
      recycling_schedule: [],
      foodscraps_schedule: [{ weekday: [1, 4], arrive: '19:25', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '新北市烏來區忠治產道沿線清運(每周2.6) 位於烏來區忠治里,垃圾車固定於週一、週六 約 19:25 抵達。'
    );
  });

  it('N:新北無 foodscraps_schedule(XBC-PINGLIN-189FC31531)——回歸測試,確認既有輸出不受新欄位影響', () => {
    const p = point({
      point_id: 'XBC-PINGLIN-189FC31531',
      city: '新北市',
      district: '坪林區',
      village: '長源里',
      point_name: '石嘈停車場',
      address: '新北市坪林區石嘈停車場',
      schedule: [{ weekday: [4], arrive: '06:40', depart: null }],
      recycling_schedule: [{ weekday: [4], arrive: '06:40', depart: null }],
      foodscraps_schedule: [],
      collection_type: null,
    });
    expect(introSentence(p)).toBe('位於長源里的「石嘈停車場」,垃圾車在週四 約 06:40 抵達。');
  });

  it('O:新北僅資源回收+廚餘、無一般垃圾班次(XBC-PINGLIN-96C48AE958)——foodscraps 非空不改變既有 I1 分支', () => {
    const p = point({
      point_id: 'XBC-PINGLIN-96C48AE958',
      city: '新北市',
      district: '坪林區',
      village: null,
      point_name: '北宜路7段338號',
      address: '新北市坪林區北宜路7段338號',
      schedule: [],
      recycling_schedule: [{ weekday: [2], arrive: '07:25', depart: null }],
      foodscraps_schedule: [{ weekday: [2, 4], arrive: '07:25', depart: null }],
      collection_type: null,
    });
    expect(introSentence(p)).toBe(
      '新北市坪林區北宜路7段338號 位於坪林區,此清運點僅提供資源回收收運,固定於週二 到站時間約 07:25。'
    );
  });

  it('P 防禦性:純廚餘點、單一時段(schedule 與 recycling_schedule 皆空)——目前無真實案例,B3 稽核發現的落差修正', () => {
    const p = point({
      point_id: 'TEST-FOODSCRAPS-ONLY',
      city: '新北市',
      district: '測試區',
      village: '測試里',
      point_name: '測試廚餘專屬點',
      address: '新北市測試區測試廚餘專屬點',
      schedule: [],
      recycling_schedule: undefined,
      foodscraps_schedule: [{ weekday: [2, 5], arrive: '16:25', depart: '16:29' }],
    });
    expect(introSentence(p)).toBe(
      '新北市測試區測試廚餘專屬點 位於測試區測試里,此清運點僅提供廚餘回收,固定於週二、週五 到站時間約在 16:25〜16:29 之間。'
    );
  });

  it('P2 防禦性:純廚餘點、星期未知——同上修正,foodscraps 星期未知分支', () => {
    const p = point({
      point_id: 'TEST-FOODSCRAPS-ONLY-UNKNOWN',
      city: '新北市',
      district: '測試區',
      village: '測試里',
      point_name: '測試廚餘專屬點2',
      address: '新北市測試區測試廚餘專屬點2',
      schedule: [],
      recycling_schedule: undefined,
      foodscraps_schedule: [{ weekday: [], arrive: '17:00', depart: null }],
    });
    expect(introSentence(p)).toBe('位於測試里的「測試廚餘專屬點2」僅提供廚餘回收,到站時間約 17:00。');
  });
});

describe('todaySummarySentence', () => {
  const kaohsiungFixed = point({
    point_id: 'KHH-SANMIN-5B3D524957',
    city: '高雄市',
    district: '三民區',
    point_name: '九如一路952號(堯山街口)',
    schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '16:25', depart: '16:29' }],
    collection_type: '定點清運',
  });

  it('A1 高雄:今天有班(週一)', () => {
    expect(todaySummarySentence(kaohsiungFixed, 1)).toBe(
      '九如一路952號(堯山街口)今天(週一)正常收運,時間落在 16:25〜16:29 之間,建議提早 5 分鐘到定點等候。'
    );
  });

  it('A1 高雄:今天休收(週三)', () => {
    expect(todaySummarySentence(kaohsiungFixed, 3)).toBe(
      '今天(週三)九如一路952號(堯山街口)沒有排定清運班次,這個點固定收運日為週一、週二、週四、週五、週六,請依時刻表安排倒垃圾時間。'
    );
  });

  const taichungPassThroughWindow = point({
    point_id: 'TXG-ZHONGQU-F79A387235',
    city: '臺中市',
    district: '中區',
    point_name: '民族路78號',
    schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:55', depart: '19:00' }],
    collection_type: '沿街收運',
  });

  it('I4 I3:台中沿街收運有時間窗口,今天有班 → 約 X〜Y 經過(不是「會約」)', () => {
    expect(todaySummarySentence(taichungPassThroughWindow, 1)).toBe(
      '今天(週一)垃圾車約 18:55〜19:00 經過民族路78號,此處為沿街收運、車輛不會停等,請提前在路邊等候。'
    );
  });

  it('I4 I3:台中沿街收運有時間窗口,今天休收(週三)', () => {
    expect(todaySummarySentence(taichungPassThroughWindow, 3)).toBe(
      '週三垃圾車不會經過民族路78號,此清運點的收運日固定在週一、週二、週四、週五、週六。'
    );
  });

  const kaohsiungPassThroughEqual = point({
    point_id: 'KHH-TAOYUAN-81C2542528',
    city: '高雄市',
    district: '桃源區',
    point_name: '第一鄰的T字路口',
    schedule: [{ weekday: [1, 5], arrive: '15:05', depart: '15:05' }],
    collection_type: '沿街收運',
  });

  it('I1 I3:高雄沿街收運 arrive=depart,今天有班(基準對照組,I3 前後不變)', () => {
    expect(todaySummarySentence(kaohsiungPassThroughEqual, 1)).toBe(
      '今天(週一)垃圾車約 15:05 經過第一鄰的T字路口,此處為沿街收運、車輛不會停等,請提前在路邊等候。'
    );
  });

  const kaohsiungPassThroughWindow = point({
    point_id: 'KHH-TAOYUAN-94EE72889B',
    city: '高雄市',
    district: '桃源區',
    point_name: '張志誠家前',
    schedule: [{ weekday: [1, 3, 5], arrive: '15:05', depart: '15:07' }],
    collection_type: '沿街收運',
  });

  it('I2 I3:高雄沿街收運 arrive≠depart 時間窗口,今天有班 → 不再誤判定點清運', () => {
    expect(todaySummarySentence(kaohsiungPassThroughWindow, 1)).toBe(
      '張志誠家前今天(週一)正常收運,垃圾車約 15:05〜15:07 經過此路段(沿街收運、不停留),建議提早 5 分鐘到路邊等候。'
    );
  });

  it('I2 I3:高雄沿街收運 arrive≠depart 時間窗口,今天休收(週二)', () => {
    expect(todaySummarySentence(kaohsiungPassThroughWindow, 2)).toBe(
      '今天(週二)張志誠家前沒有排定清運班次,這個點固定收運日為週一、週三、週五,請依時刻表安排倒垃圾時間。'
    );
  });

  const taoyuanVaried = point({
    point_id: 'TYN-LUZHU-33C4F756E7',
    city: '桃園市',
    district: '蘆竹區',
    point_name: '南崁路二段483號(富國路三段交叉口)',
    schedule: [
      { weekday: [2, 5, 6], arrive: '17:25', depart: null },
      { weekday: [1, 4], arrive: '17:30', depart: null },
    ],
    collection_type: null,
  });

  it('B1:todaySummarySentence 依實際 entry 分流,週二→17:25(不會像 introSentence 修正前那樣把多時段誤講成單一時間)', () => {
    expect(todaySummarySentence(taoyuanVaried, 2)).toBe(
      '今天是週二,南崁路二段483號(富國路三段交叉口)有清運班次,清運車預計 17:25 抵達,別錯過。'
    );
  });

  it('B1:同一點,週一→17:30(與週二不同,證明沒有 Bug A 那種聯集/單一時間錯配)', () => {
    expect(todaySummarySentence(taoyuanVaried, 1)).toBe(
      '今天是週一,南崁路二段483號(富國路三段交叉口)有清運班次,清運車預計 17:30 抵達,別錯過。'
    );
  });

  const taoyuanWeekdayUnknown = point({
    point_id: 'TYN-LUZHU-EF5C55FA0C',
    city: '桃園市',
    district: '蘆竹區',
    point_name: '長興路四段12號',
    schedule: [{ weekday: [], arrive: '17:00', depart: null }],
    recycling_schedule: [{ weekday: [], arrive: '17:00', depart: null }],
    collection_type: null,
  });

  it('D1 桃園星期未知,精簡版摘要句(不重複頁面正文 weekdayUnknownNotice 的官方系統說明)', () => {
    expect(todaySummarySentence(taoyuanWeekdayUnknown, 3)).toBe(
      '長興路四段12號的收運星期本站尚未取得,到站時間請參考下方時刻表,詳細說明如下。'
    );
  });

  const recyclingOnly = point({
    point_id: 'TYN-BADE-E675ED971B',
    city: '桃園市',
    district: '八德區',
    point_name: '雅典桂冠',
    schedule: [],
    recycling_schedule: [{ weekday: [1, 4, 6], arrive: '07:55', depart: null }],
    collection_type: null,
  });

  it('G1 I1:純資源回收點不得說「今天沒有收運」', () => {
    expect(todaySummarySentence(recyclingOnly, 3)).toBe('雅典桂冠僅提供資源回收收運,無一般垃圾清運服務,回收到站時間請見下方時刻表。');
  });

  const taichungBugAB = point({
    point_id: 'TXG-ZHONGQU-8C508686AB',
    city: '臺中市',
    district: '中區',
    point_name: '光復路119號(豪華戲院前)',
    schedule: [
      { weekday: [1, 4, 6], arrive: '14:15', depart: '14:25' },
      { weekday: [2, 5], arrive: '14:25', depart: '14:25' },
    ],
    recycling_schedule: [{ weekday: [1, 4, 6], arrive: '14:25', depart: '14:25' }],
    collection_type: '沿街收運',
    notes: '車牌312-UX',
  });

  it('J1 I2+I3:週一(14:15〜14:25 窗口)——修正前這天會被誤判成定點清運', () => {
    expect(todaySummarySentence(taichungBugAB, 1)).toBe(
      '今天是週一,光復路119號(豪華戲院前)為沿街收運路段,垃圾車約 14:15〜14:25 經過,請提早把垃圾拿到路邊。'
    );
  });

  it('J1 I2+I3:週二(14:25 單一時刻,與週一不同 entry)——同一個點但不同天的形狀正確分流', () => {
    expect(todaySummarySentence(taichungBugAB, 2)).toBe(
      '今天是週二,光復路119號(豪華戲院前)為沿街收運路段,垃圾車約 14:25 經過,請提早把垃圾拿到路邊。'
    );
  });

  it('J1 I2+I3:今天休收(週三)', () => {
    expect(todaySummarySentence(taichungBugAB, 3)).toBe(
      '光復路119號(豪華戲院前)今天(週三)休收,下一個收運日請參考本頁時刻表(固定為週一、週二、週四、週五、週六)。'
    );
  });

  const xinbeiFoodscrapsSubset = point({
    point_id: 'XBC-WANLI-8EAAE1E23D',
    city: '新北市',
    district: '萬里區',
    point_name: '瑪鋉路30巷2弄4號',
    schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:17', depart: null }],
    recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:17', depart: null }],
    foodscraps_schedule: [{ weekday: [1, 2, 5, 6], arrive: '19:17', depart: null }],
    collection_type: null,
  });

  it('K:新北 foodscraps_schedule 為一般垃圾子集,今天有班(週二)——foodscraps 欄位不影響既有分流', () => {
    expect(todaySummarySentence(xinbeiFoodscrapsSubset, 2)).toBe(
      '今天(週二)垃圾車會到瑪鋉路30巷2弄4號,預計 19:17 抵達,請提前將垃圾拿到現場等候。'
    );
  });

  const xinbeiFoodscrapsCoveredByRecycling = point({
    point_id: 'XBC-WANLI-9FA3B36F8E',
    city: '新北市',
    district: '萬里區',
    point_name: '獅頭路2號巷口',
    schedule: [{ weekday: [2, 4, 5, 6], arrive: '18:38', depart: null }],
    recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:38', depart: null }],
    foodscraps_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '18:38', depart: null }],
    collection_type: null,
  });

  it('L:新北 foodscraps_schedule 多出的星期由 recycling_schedule 涵蓋,今天有班(週二)', () => {
    expect(todaySummarySentence(xinbeiFoodscrapsCoveredByRecycling, 2)).toBe(
      '今天(週二)垃圾車會到獅頭路2號巷口,預計 18:38 抵達,請提前將垃圾拿到現場等候。'
    );
  });

  const xinbeiFoodscrapsOrphan = point({
    point_id: 'XBC-WULAI-73594FD90B',
    city: '新北市',
    district: '烏來區',
    point_name: '忠治產道沿線清運(每周2.6)',
    schedule: [{ weekday: [1, 6], arrive: '19:25', depart: null }],
    recycling_schedule: [],
    foodscraps_schedule: [{ weekday: [1, 4], arrive: '19:25', depart: null }],
    collection_type: null,
  });

  it('M:新北 foodscraps_schedule 多出的星期查無任何對應,今天休收(週二,一般垃圾固定週一、週六)', () => {
    expect(todaySummarySentence(xinbeiFoodscrapsOrphan, 2)).toBe(
      '週二垃圾車不會經過忠治產道沿線清運(每周2.6),此清運點的收運日固定在週一、週六。'
    );
  });

  const xinbeiNoFoodscraps = point({
    point_id: 'XBC-PINGLIN-189FC31531',
    city: '新北市',
    district: '坪林區',
    point_name: '石嘈停車場',
    schedule: [{ weekday: [4], arrive: '06:40', depart: null }],
    recycling_schedule: [{ weekday: [4], arrive: '06:40', depart: null }],
    foodscraps_schedule: [],
    collection_type: null,
  });

  it('N:新北無 foodscraps_schedule,今天休收(週二,一般垃圾固定週四)——回歸測試', () => {
    expect(todaySummarySentence(xinbeiNoFoodscraps, 2)).toBe(
      '石嘈停車場今天(週二)休收,下一個收運日請參考本頁時刻表(固定為週四)。'
    );
  });

  const xinbeiRecyclingAndFoodscrapsOnly = point({
    point_id: 'XBC-PINGLIN-96C48AE958',
    city: '新北市',
    district: '坪林區',
    point_name: '北宜路7段338號',
    schedule: [],
    recycling_schedule: [{ weekday: [2], arrive: '07:25', depart: null }],
    foodscraps_schedule: [{ weekday: [2, 4], arrive: '07:25', depart: null }],
    collection_type: null,
  });

  it('O:新北僅資源回收+廚餘、無一般垃圾班次——foodscraps 非空不改變既有 G1/I1 分支', () => {
    expect(todaySummarySentence(xinbeiRecyclingAndFoodscrapsOnly, 2)).toBe(
      '北宜路7段338號僅提供資源回收收運,無一般垃圾清運服務,回收到站時間請見下方時刻表。'
    );
  });

  const foodscrapsOnlyFixed = point({
    point_id: 'TEST-FOODSCRAPS-ONLY',
    city: '新北市',
    district: '測試區',
    point_name: '測試廚餘專屬點',
    schedule: [],
    recycling_schedule: undefined,
    foodscraps_schedule: [{ weekday: [2, 5], arrive: '16:25', depart: '16:29' }],
  });

  it('P 防禦性:純廚餘點、單一時段(schedule 與 recycling_schedule 皆空)——B3 稽核發現的落差修正', () => {
    expect(todaySummarySentence(foodscrapsOnlyFixed, 2)).toBe(
      '測試廚餘專屬點僅提供廚餘回收,無一般垃圾清運服務,到站時間請見下方時刻表。'
    );
  });

  const foodscrapsOnlyUnknown = point({
    point_id: 'TEST-FOODSCRAPS-ONLY-UNKNOWN',
    city: '新北市',
    district: '測試區',
    point_name: '測試廚餘專屬點2',
    schedule: [],
    recycling_schedule: undefined,
    foodscraps_schedule: [{ weekday: [], arrive: '17:00', depart: null }],
  });

  it('P2 防禦性:純廚餘點、星期未知——同上修正,foodscraps-only 分支的第二個文案變體', () => {
    expect(todaySummarySentence(foodscrapsOnlyUnknown, 2)).toBe(
      '本站僅取得測試廚餘專屬點2的廚餘回收班表,此點不提供一般垃圾清運,到站時間請參考下方時刻表。'
    );
  });
});
