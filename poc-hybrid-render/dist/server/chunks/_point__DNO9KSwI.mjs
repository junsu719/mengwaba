globalThis.process ??= {};
globalThis.process.env ??= {};
import { V as __exportAll, d as renderTemplate, i as renderComponent, w as createAstro } from "./server_CXwT-aHN.mjs";
import { t as createComponent } from "./compiler_CA6UDM9h.mjs";
import { i as parsePointId, n as $$PointPage, r as groupByDistrict, t as getCity } from "./types_BPCma5qX.mjs";
import { env } from "cloudflare:workers";
//#region src/lib/data-kv.ts
async function loadDistrictFromKV(kv, citySlug, districtSlug) {
	return await kv.get(`district:${citySlug}:${districtSlug}`, "json") ?? [];
}
//#endregion
//#region src/pages/poc-kv/[city]/[district]/[point].astro
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
	const kv = env.POINTS_KV;
	if (!kv) return new Response("POINTS_KV binding 未設定(需 wrangler/platformProxy 提供本機模擬 KV)", { status: 500 });
	const city = getCity(citySlug);
	const t0 = Date.now();
	const districtPoints = await loadDistrictFromKV(kv, citySlug, districtSlug);
	const tDistrict = Date.now() - t0;
	if (districtPoints.length === 0) return new Response("District not found", { status: 404 });
	const point = districtPoints.find((p) => parsePointId(p.point_id).pointSlug === pointSlug);
	if (!point) return new Response("Point not found", { status: 404 });
	const group = groupByDistrict(districtPoints)[0];
	group.points = districtPoints;
	console.log(`[poc-kv] district KV read took ${tDistrict}ms, points=${districtPoints.length}`);
	return renderTemplate`${renderComponent($$result, "PointPage", $$PointPage, {
		"point": point,
		"group": group,
		"city": city,
		"dataMode": `kv (district read ${tDistrict}ms, ${districtPoints.length} pts)`
	})}`;
}, "/home/junsu/projects/mengwaba/poc-hybrid-render/src/pages/poc-kv/[city]/[district]/[point].astro", void 0);
var $$file = "/home/junsu/projects/mengwaba/poc-hybrid-render/src/pages/poc-kv/[city]/[district]/[point].astro";
var $$url = "/poc-kv/[city]/[district]/[point]";
//#endregion
//#region \0virtual:astro:page:src/pages/poc-kv/[city]/[district]/[point]@_@astro
var page = () => _point__exports;
//#endregion
export { page };
