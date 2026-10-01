// 「設為我家的清運點」:只把 point_id 存在使用者瀏覽器 localStorage,不建帳號、不傳到伺服器。
// localStorage 在無痕/封鎖網站資料時可能 throw,一律包 try/catch:讀不到視為未設定,寫不進去回傳 false。
export const HOME_POINT_KEY = 'mengwaba:home-point';

export function getHomePointId(): string | null {
  try {
    const v = localStorage.getItem(HOME_POINT_KEY);
    return v && v.length <= 100 ? v : null;
  } catch {
    return null;
  }
}

export function setHomePointId(id: string): boolean {
  try {
    localStorage.setItem(HOME_POINT_KEY, id);
    return getHomePointId() === id;
  } catch {
    return false;
  }
}

export function clearHomePointId(): void {
  try {
    localStorage.removeItem(HOME_POINT_KEY);
  } catch {}
}

/** 以獨立的探測 key 測 localStorage 能否寫入(不動到真正的設定)。 */
export function homePointStorageAvailable(): boolean {
  try {
    const k = `${HOME_POINT_KEY}:probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
