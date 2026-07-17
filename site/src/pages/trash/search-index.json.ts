import type { APIRoute } from 'astro';
import { CITIES } from '../../lib/data';
import { loadCityPoints } from '../../lib/data-static';
import { buildSearchIndex } from '../../lib/search';

export const GET: APIRoute = () => {
  const index = buildSearchIndex(
    CITIES.map((city) => ({ slug: city.slug, name: city.name, points: loadCityPoints(city.file) }))
  );
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
