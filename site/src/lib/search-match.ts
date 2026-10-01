// 前端搜尋比對(2026-10-01):支援「縣市+行政區+路名」完整寫法。輸入中的縣市名/行政區名先當篩選條件縮小範圍,
// 剩下的字再比對清運點名稱/村里。純函式、只吃既有搜尋索引(SearchIndex),不新增任何查詢。
// 正規化:NFKC、小寫、「臺」→「台」、移除空白與標點;縣市/行政區可省略「市/縣/區/鄉/鎮」字尾。
import type { SearchIndex } from './search';

export interface SearchMatch {
  name: string;
  sub: string;
  href: string;
  score: number;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const ROAD_START = /^[路街道巷弄段里村號]/;
const STRAY_EDGE = /^[台市區縣鄉鎮]+|[台市區縣鄉鎮]+$/g;

interface Prepared {
  /** 每筆清運點正規化後的「名稱+村里」與「名稱+村里+行政區」。 */
  nameHay: string[];
  fullHay: string[];
  cityNames: { full: string; core: string }[];
  /** 行政區索引 → 所屬縣市索引(索引內 district 本身不帶縣市,由 points 反推)。 */
  districtCity: number[];
  districts: { idx: number; full: string; core: string }[];
}

const cache = new WeakMap<SearchIndex, Prepared>();

function prepare(data: SearchIndex): Prepared {
  let p = cache.get(data);
  if (p) return p;
  const districtCity: number[] = [];
  const nameHay: string[] = [];
  const fullHay: string[] = [];
  for (const [cityIdx, districtIdx, name, village] of data.points) {
    districtCity[districtIdx] = cityIdx;
    const base = normalizeText(`${name}${village ?? ''}`);
    nameHay.push(base);
    fullHay.push(base + normalizeText(data.districts[districtIdx].n));
  }
  const strip = (s: string, re: RegExp) => (s.length > 2 && re.test(s) ? s.slice(0, -1) : s);
  p = {
    nameHay,
    fullHay,
    cityNames: data.cities.map((c) => {
      const full = normalizeText(c.n);
      return { full, core: strip(full, /[市縣]$/) };
    }),
    districtCity,
    districts: data.districts.map((d, idx) => {
      const full = normalizeText(d.n);
      return { idx, full, core: strip(full, /[區鄉鎮市]$/) };
    }),
  };
  cache.set(data, p);
  return p;
}

interface Parsed {
  cities: Set<number>;
  districts: Set<number>;
  rest: string;
}

function parseQuery(data: SearchIndex, prep: Prepared, q: string): Parsed {
  let rest = q;
  const cities = new Set<number>();
  // 縣市:先找全名,再找省略「市/縣」的簡稱
  for (const key of ['full', 'core'] as const) {
    if (cities.size) break;
    prep.cityNames.forEach((c, i) => {
      const tok = c[key];
      const at = tok.length >= 2 ? rest.indexOf(tok) : -1;
      if (at === -1) return;
      // 省略「市/縣」的簡稱後面緊接路名字尾(如「台中路」「新北路」),視為路名不是縣市
      if (tok !== c.full && ROAD_START.test(rest.slice(at + tok.length))) return;
      cities.add(i);
    });
    if (cities.size) {
      const tok = prep.cityNames[[...cities][0]][key];
      rest = rest.replace(tok, '');
    }
  }
  // 行政區:限縮在已指定縣市內;全名優先,省略「區」的簡稱需符合「後面不是路名字尾」才採用
  const districts = new Set<number>();
  const inScope = (d: { idx: number }) => !cities.size || cities.has(prep.districtCity[d.idx]);
  let best: { tok: string; names: Set<number> } | null = null;
  for (const d of prep.districts) {
    if (!inScope(d) || prep.districtCity[d.idx] === undefined) continue;
    for (const key of ['full', 'core'] as const) {
      const tok = d[key];
      if (tok.length < (key === 'core' ? 2 : 2)) continue;
      const at = rest.indexOf(tok);
      if (at === -1) continue;
      if (key === 'core' && tok !== d.full) {
        const after = rest.slice(at + tok.length);
        if (after.length < 2 || ROAD_START.test(after)) continue;
      }
      if (!best || tok.length > best.tok.length) best = { tok, names: new Set() };
      if (best.tok === tok) best.names.add(d.idx);
      break;
    }
  }
  if (best) {
    // 同名行政區(跨縣市重複)全部納入;名稱相同判斷以 full/core 皆等於 tok 為準
    for (const d of prep.districts) {
      if (inScope(d) && prep.districtCity[d.idx] !== undefined && (d.full === best.tok || d.core === best.tok)) {
        districts.add(d.idx);
      }
    }
    rest = rest.replace(best.tok, '');
  }
  return { cities, districts, rest };
}

export function searchPoints(
  data: SearchIndex,
  query: string,
  resultLimit = 20,
  scanLimit = 300
): SearchMatch[] {
  const q = normalizeText(query);
  if (!q) return [];
  const prep = prepare(data);
  const parsed = parseQuery(data, prep, q);
  const filtered = parsed.cities.size > 0 || parsed.districts.size > 0;

  const run = (needle: string, useFilter: boolean): SearchMatch[] => {
    const out: SearchMatch[] = [];
    for (let i = 0; i < data.points.length; i++) {
      const [cityIdx, districtIdx, name, village, pointSlug] = data.points[i];
      if (useFilter) {
        if (parsed.cities.size && !parsed.cities.has(cityIdx)) continue;
        if (parsed.districts.size && !parsed.districts.has(districtIdx)) continue;
      }
      const hay = useFilter && parsed.districts.size ? prep.nameHay[i] : prep.fullHay[i];
      const score = needle ? hay.indexOf(needle) : 0;
      if (score === -1) continue;
      const city = data.cities[cityIdx];
      const district = data.districts[districtIdx];
      const where = village ? `${district.n}・${village}` : district.n;
      out.push({
        name,
        // 使用者沒指定縣市時一律標示縣市,讓跨縣市同名行政區/路名可分辨
        sub: useFilter && parsed.cities.size ? where : `${city.n}${where}`,
        href: `/trash/${city.s}/${district.s}/${pointSlug}/`,
        score,
      });
      if (out.length >= scanLimit) break;
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, resultLimit);
  };

  if (filtered) {
    let r = run(parsed.rest, true);
    // 殘留的孤立「台/市/區…」字(例如多打的字)造成零結果時,去掉兩端再試一次,仍限縮在篩選範圍內
    if (!r.length) {
      const cleaned = parsed.rest.replace(STRAY_EDGE, '');
      if (cleaned !== parsed.rest) r = run(cleaned, true);
    }
    if (r.length) return r;
    // 篩選解讀完全找不到(如路名本身含縣市/行政區字樣):退回整串當一般關鍵字,不套篩選
    return run(q, false);
  }
  return run(q, false);
}
