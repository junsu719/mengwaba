import type { APIRoute } from 'astro';
import { CITIES, type CityInfo } from '../../../lib/data';
import { loadCityPoints } from '../../../lib/data-static';
import { buildSearchIndex } from '../../../lib/search';

export function getStaticPaths() {
  return CITIES.map((city) => ({ params: { city: city.slug }, props: { city } }));
}

export const GET: APIRoute = ({ props }) => {
  const { city } = props as { city: CityInfo };
  const index = buildSearchIndex([{ slug: city.slug, name: city.name, points: loadCityPoints(city.file) }]);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
