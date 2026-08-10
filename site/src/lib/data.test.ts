import { describe, expect, it } from 'vitest';
import type { CollectionPoint } from './data';
import { computeDistrictStats, fetchedAtDateRange, groupByVillage } from './data';

/**
 * Golden 測試,比照 content.test.ts 的慣例:全部用寫死的小型 fixture,不讀
 * data/normalized/*.json(該資料每季手動更新一次,讀活資料會在下一季換資料時
 * 產生跟程式碼改動無關的假失敗)。這裡測的是「原始點資料 → 聚合數字」這段純計算,
 * fixture 刻意做小(5-6 個點內),用來精準命中每個計算分支,不追求跟真實行政區
 * 規模一致——真實資料算出來的實際字串已於 2026-08-10 由 Jun 人工審閱過(高雄三民區、
 * 臺中石岡區、桃園八德區、新北平溪區 4 個真實案例 + 1 個合成邊界案例),此處只負責
 * 鎖住「同一種資料形狀應該算出同一組數字」這個行為契約。
 */

function point(overrides: Partial<CollectionPoint>): CollectionPoint {
  return {
    point_id: 'TEST-0000000000',
    city: '測試市',
    district: '測試區',
    village: '測試里',
    point_name: '測試路一段1號',
    address: null,
    lat: null,
    lng: null,
    schedule: [],
    recycling_schedule: undefined,
    foodscraps_schedule: undefined,
    collection_type: null,
    notes: null,
    source: 'test',
    fetched_at: '2026-07-01',
    ...overrides,
  };
}

describe('groupByVillage', () => {
  it('依中文排序回傳,不含無里別的點', () => {
    const points = [
      point({ point_id: 'A', village: '三民里' }),
      point({ point_id: 'B', village: '一心里' }),
      point({ point_id: 'C', village: null }),
      point({ point_id: 'D', village: '三民里' }),
    ];
    const groups = groupByVillage(points);
    expect(groups.map((g) => g.village)).toEqual(['一心里', '三民里']);
    expect(groups.find((g) => g.village === '三民里')?.points.map((p) => p.point_id)).toEqual(['A', 'D']);
  });

  it('全部點皆無里別時回傳空陣列', () => {
    expect(groupByVillage([point({ village: null })])).toEqual([]);
  });
});

describe('computeDistrictStats', () => {
  it('均勻分佈的正常行政區(比照石岡區形狀:多數星期一致、週三週日無班次)', () => {
    const points = [
      point({ point_id: '1', village: '甲里', schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '16:10', depart: '16:15' }], recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '16:10', depart: '16:15' }] }),
      point({ point_id: '2', village: '甲里', schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '17:00', depart: '17:05' }], recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '17:00', depart: '17:05' }] }),
      point({ point_id: '3', village: '乙里', schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:40', depart: '19:45' }], recycling_schedule: [{ weekday: [1, 2, 4, 5, 6], arrive: '19:40', depart: '19:45' }] }),
    ];
    const stats = computeDistrictStats(points);
    expect(stats).toEqual({
      pointCount: 3,
      villageCount: 2,
      weekdayScheduleCounts: [0, 3, 3, 0, 3, 3, 3, 0],
      weekdayUnknownPointCount: 0,
      noSchedulePointCount: 0,
      earliestArrive: '16:10',
      latestArrive: '19:40',
      hourCounts: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0,
      ],
      recyclingPointCount: 3,
      recyclingCoveragePct: 100,
      foodscrapsPointCount: 0,
      foodscrapsCoveragePct: 0,
    });
  });

  it('星期未知 + 純回收點混合(比照八德區形狀)', () => {
    const points = [
      point({ point_id: '1', schedule: [{ weekday: [1, 4], arrive: '08:00', depart: null }] }),
      point({ point_id: '2', schedule: [{ weekday: [], arrive: '09:00', depart: null }] }),
      point({ point_id: '3', schedule: [{ weekday: [], arrive: '09:30', depart: null }] }),
      point({ point_id: '4', schedule: [], recycling_schedule: [{ weekday: [2], arrive: '10:00', depart: null }] }),
    ];
    const stats = computeDistrictStats(points);
    expect(stats.weekdayUnknownPointCount).toBe(2);
    expect(stats.noSchedulePointCount).toBe(1);
    expect(stats.weekdayScheduleCounts[1]).toBe(1);
    expect(stats.weekdayScheduleCounts[4]).toBe(1);
    expect(stats.earliestArrive).toBe('08:00');
    expect(stats.latestArrive).toBe('09:30');
    expect(stats.recyclingPointCount).toBe(1);
    expect(stats.recyclingCoveragePct).toBe(25);
  });

  it('全區皆有廚餘資料(比照平溪區形狀)', () => {
    const points = [
      point({ point_id: '1', schedule: [{ weekday: [1], arrive: '18:02', depart: null }], foodscraps_schedule: [{ weekday: [1], arrive: '18:02', depart: null }] }),
      point({ point_id: '2', schedule: [{ weekday: [1], arrive: '18:10', depart: null }], foodscraps_schedule: [{ weekday: [1], arrive: '18:10', depart: null }] }),
    ];
    const stats = computeDistrictStats(points);
    expect(stats.foodscrapsPointCount).toBe(2);
    expect(stats.foodscrapsCoveragePct).toBe(100);
  });

  it('全區無 schedule(純資源回收行政區)——earliestArrive/latestArrive 為 null', () => {
    const points = [point({ schedule: [], recycling_schedule: [{ weekday: [1], arrive: '09:00', depart: null }] })];
    const stats = computeDistrictStats(points);
    expect(stats.earliestArrive).toBeNull();
    expect(stats.latestArrive).toBeNull();
    expect(stats.noSchedulePointCount).toBe(1);
  });

  it('覆蓋率四捨五入(1/3 → 33%)', () => {
    const points = [
      point({ point_id: '1', schedule: [{ weekday: [1], arrive: '09:00', depart: null }], recycling_schedule: [{ weekday: [1], arrive: '09:00', depart: null }] }),
      point({ point_id: '2', schedule: [{ weekday: [1], arrive: '09:00', depart: null }] }),
      point({ point_id: '3', schedule: [{ weekday: [1], arrive: '09:00', depart: null }] }),
    ];
    expect(computeDistrictStats(points).recyclingCoveragePct).toBe(33);
  });
});

describe('fetchedAtDateRange', () => {
  it('全部同一天(純日期格式)', () => {
    expect(fetchedAtDateRange([point({ fetched_at: '2026-07-21' }), point({ fetched_at: '2026-07-21' })])).toEqual({
      min: '2026-07-21',
      max: '2026-07-21',
    });
  });

  it('混合純日期與含微秒完整時間戳(新北格式)——一律截前 10 碼比較', () => {
    const points = [
      point({ fetched_at: '2026-07-23' }),
      point({ fetched_at: '2026-07-28T11:50:16.537798+08:00' }),
    ];
    expect(fetchedAtDateRange(points)).toEqual({ min: '2026-07-23', max: '2026-07-28' });
  });
});
