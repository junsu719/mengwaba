export interface ScheduleEntry {
  weekday: number[];
  arrive: string;
  depart: string;
}

export interface CollectionPoint {
  point_id: string;
  city: string;
  district: string | null;
  village: string | null;
  point_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  schedule: ScheduleEntry[];
  recycling_schedule?: ScheduleEntry[];
  collection_type: string;
  notes: string | null;
  source: string;
  fetched_at: string;
}

export interface CityInfo {
  slug: string;
  name: string;
  file: string;
  sourceName: string;
  sourceUrl: string;
}

export const CITIES: CityInfo[] = [
  {
    slug: 'kaohsiung',
    name: '高雄市',
    file: 'kaohsiung',
    sourceName: '高雄市政府環境保護局',
    sourceUrl: 'https://data.kcg.gov.tw/',
  },
];

export function getCity(slug: string): CityInfo {
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) throw new Error(`未知縣市 slug: ${slug}`);
  return city;
}
