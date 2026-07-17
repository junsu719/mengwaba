import type { CollectionPoint } from './types';
import { groupByDistrict, type DistrictGroup } from './logic';
// Option A: 資料隨 Functions/Worker 打包。用靜態 import 讓 bundler 在 build 時
// 把整個 JSON 內聯進 Worker bundle,執行期不需要任何 I/O。
// @ts-expect-error - resolveJsonModule 由 astro/vite 處理
import raw from '../../data/kaohsiung.json';

const all = raw as unknown as CollectionPoint[];

let _publishable: CollectionPoint[] | null = null;

export function loadCityPointsBundled(): CollectionPoint[] {
  if (_publishable) return _publishable;
  _publishable = all.filter((p) => p.district && p.point_name && p.schedule.length > 0);
  return _publishable;
}

// 模組層級快取:同一 Worker isolate 若維持 warm,分組運算(groupByDistrict 對
// 18,805 筆跑一次雜湊分組)只需算一次;isolate 冷啟動時仍要重算一次,這正是
// Phase 1 要實測的「bundled 選項每次冷啟動 CPU 成本」。
let _groupsCache: DistrictGroup[] | null = null;

export function getGroupsCachedBundled(): DistrictGroup[] {
  if (_groupsCache) return _groupsCache;
  _groupsCache = groupByDistrict(loadCityPointsBundled());
  return _groupsCache;
}
