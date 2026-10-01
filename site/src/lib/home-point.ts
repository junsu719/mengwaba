// 「我的清運點」:只把 point_id 清單存在使用者瀏覽器 localStorage,不建帳號、不傳到伺服器。
// localStorage 在無痕/封鎖網站資料時可能 throw,一律包 try/catch:讀不到視為空清單,寫不進去回傳 false。
// 舊版只存單一 ID(key = LEGACY_KEY),讀取時自動併入清單並移除舊 key。
export const MY_POINTS_KEY = 'mengwaba:my-points';
const LEGACY_KEY = 'mengwaba:home-point';
export const MY_POINTS_MAX = 8;

const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100;

function write(ids: string[]): boolean {
  try {
    localStorage.setItem(MY_POINTS_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export function getMyPointIds(): string[] {
  try {
    let ids: string[] = [];
    const raw = localStorage.getItem(MY_POINTS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed.filter(validId);
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      if (validId(legacy) && !ids.includes(legacy)) ids.push(legacy);
      if (write(ids)) localStorage.removeItem(LEGACY_KEY);
    }
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

export function hasMyPoint(id: string): boolean {
  return getMyPointIds().includes(id);
}

/** 加入成功(或本來就在清單)回傳 true;滿額或寫不進去回傳 false。 */
export function addMyPoint(id: string): boolean {
  const ids = getMyPointIds();
  if (ids.includes(id)) return true;
  if (ids.length >= MY_POINTS_MAX) return false;
  return write([...ids, id]) && getMyPointIds().includes(id);
}

export function removeMyPoint(id: string): void {
  write(getMyPointIds().filter((x) => x !== id));
}

/** 以獨立的探測 key 測 localStorage 能否寫入(不動到真正的設定)。 */
export function myPointsStorageAvailable(): boolean {
  try {
    const k = `${MY_POINTS_KEY}:probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
