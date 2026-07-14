import type { APIRoute } from 'astro';
import { loadKaohsiungPoints, CITY_SLUG, CITY_NAME } from '../../lib/data';
import { buildSearchIndex } from '../../lib/search';

export const GET: APIRoute = () => {
  const index = buildSearchIndex([{ slug: CITY_SLUG, name: CITY_NAME, points: loadKaohsiungPoints() }]);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
