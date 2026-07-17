globalThis.process ??= {};
globalThis.process.env ??= {};
import { V as __exportAll, d as renderTemplate, i as renderComponent, w as createAstro } from "./server_CXwT-aHN.mjs";
import { t as createComponent } from "./compiler_CA6UDM9h.mjs";
import { i as parsePointId, n as $$PointPage, r as groupByDistrict, t as getCity } from "./types_BPCma5qX.mjs";
import { env } from "cloudflare:workers";
//#region src/lib/data-d1.ts
function rowToPoint(row) {
	return {
		point_id: row.point_id,
		city: row.city,
		district: row.district,
		village: row.village,
		point_name: row.point_name,
		address: row.address,
		lat: row.lat,
		lng: row.lng,
		schedule: JSON.parse(row.schedule),
		recycling_schedule: row.recycling_schedule ? JSON.parse(row.recycling_schedule) : void 0,
		collection_type: row.collection_type,
		notes: row.notes,
		source: row.source,
		fetched_at: row.fetched_at
	};
}
async function loadDistrictFromD1(db, citySlug, districtSlug) {
	const { results } = await db.prepare("SELECT * FROM points WHERE city_slug = ? AND district_slug = ?").bind(citySlug, districtSlug).all();
	return results.map(rowToPoint);
}
//#endregion
//#region src/pages/poc-d1/[city]/[district]/[point].astro
var _point__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Point,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("http://localhost:4321");
var $$Point = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Point;
	const { city: citySlug, district: districtSlug, point: pointSlug } = Astro.params;
	if (citySlug !== "kaohsiung") return new Response("Not Found (PoC 只支援 kaohsiung)", { status: 404 });
	const db = env.POINTS_DB;
	if (!db) return new Response("POINTS_DB binding 未設定(需 wrangler/platformProxy 提供本機模擬 D1)", { status: 500 });
	const city = getCity(citySlug);
	const t0 = Date.now();
	const districtPoints = await loadDistrictFromD1(db, citySlug, districtSlug);
	const tDistrict = Date.now() - t0;
	if (districtPoints.length === 0) return new Response("District not found", { status: 404 });
	const point = districtPoints.find((p) => parsePointId(p.point_id).pointSlug === pointSlug);
	if (!point) return new Response("Point not found", { status: 404 });
	const group = groupByDistrict(districtPoints)[0];
	group.points = districtPoints;
	console.log(`[poc-d1] district D1 query took ${tDistrict}ms, points=${districtPoints.length}`);
	return renderTemplate`${renderComponent($$result, "PointPage", $$PointPage, {
		"point": point,
		"group": group,
		"city": city,
		"dataMode": `d1 (district query ${tDistrict}ms, ${districtPoints.length} pts)`
	})}`;
}, "/home/junsu/projects/mengwaba/poc-hybrid-render/src/pages/poc-d1/[city]/[district]/[point].astro", void 0);
var $$file = "/home/junsu/projects/mengwaba/poc-hybrid-render/src/pages/poc-d1/[city]/[district]/[point].astro";
var $$url = "/poc-d1/[city]/[district]/[point]";
//#endregion
//#region \0virtual:astro:page:src/pages/poc-d1/[city]/[district]/[point]@_@astro
var page = () => _point__exports;
//#endregion
export { page };
