globalThis.process ??= {};
globalThis.process.env ??= {};
import { S as unescapeHTML, _ as addAttribute, a as Fragment, c as renderSlot, d as renderTemplate, g as renderHead, h as maybeRenderHead, i as renderComponent, w as createAstro } from "./server_CXwT-aHN.mjs";
import { t as createComponent } from "./compiler_CA6UDM9h.mjs";
//#region src/layouts/BaseLayout.astro
createAstro("http://localhost:4321");
var $$BaseLayout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$BaseLayout;
	const { title, description, jsonLd = [] } = Astro.props;
	return renderTemplate`<html lang="zh-Hant" data-astro-cid-z4jru4n3><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description"${addAttribute(description, "content")}><link rel="canonical"${addAttribute(Astro.url.href, "href")}><meta name="theme-color" content="#1b7a43">${jsonLd.map((data) => renderTemplate`<script type="application/ld+json">${unescapeHTML(JSON.stringify(data))}<\/script>`)}${renderHead($$result)}</head><body data-astro-cid-z4jru4n3><header class="site-header" data-astro-cid-z4jru4n3><a class="brand" href="/" data-astro-cid-z4jru4n3>悶蛙吧 MengWaBa</a></header><main data-astro-cid-z4jru4n3>${renderSlot($$result, $$slots["default"])}</main><footer class="site-footer" data-astro-cid-z4jru4n3>${renderSlot($$result, $$slots["footer"], renderTemplate`<p data-astro-cid-z4jru4n3>資料來源:各縣市政府資料開放平台,依「政府資料開放授權條款第1版」提供,各頁面詳細來源請見頁面內標註。</p><p data-astro-cid-z4jru4n3>本站為民間非官方服務,實際清運時間如有變動,請以清潔隊公告為準。</p>`)}</footer></body></html>`;
}, "/home/junsu/projects/mengwaba/poc-hybrid-render/src/layouts/BaseLayout.astro", void 0);
//#endregion
//#region src/lib/logic.ts
var TAIWAN_LAT_RANGE = [21.5, 25.5];
var TAIWAN_LNG_RANGE = [119.5, 122.5];
function hasValidGeo(p) {
	return p.lat !== null && p.lng !== null && p.lat >= TAIWAN_LAT_RANGE[0] && p.lat <= TAIWAN_LAT_RANGE[1] && p.lng >= TAIWAN_LNG_RANGE[0] && p.lng <= TAIWAN_LNG_RANGE[1];
}
function parsePointId(pointId) {
	const m = pointId.match(/^[A-Z]+-([A-Z]+)-(\d+)$/);
	if (!m) throw new Error(`無法解析 point_id: ${pointId}`);
	return {
		districtSlug: m[1].toLowerCase(),
		pointSlug: m[2]
	};
}
function groupByDistrict(points) {
	const map = /* @__PURE__ */ new Map();
	for (const p of points) {
		const { districtSlug } = parsePointId(p.point_id);
		let group = map.get(districtSlug);
		if (!group) {
			group = {
				district: p.district,
				districtSlug,
				points: []
			};
			map.set(districtSlug, group);
		}
		group.points.push(p);
	}
	return [...map.values()].sort((a, b) => a.districtSlug.localeCompare(b.districtSlug));
}
function haversineKm(lat1, lng1, lat2, lng2) {
	const R = 6371;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestPoints(target, districtPoints, n = 5) {
	const others = districtPoints.filter((p) => p.point_id !== target.point_id);
	if (hasValidGeo(target)) return others.filter(hasValidGeo).map((p) => ({
		p,
		d: haversineKm(target.lat, target.lng, p.lat, p.lng)
	})).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.p);
	const sameVillage = others.filter((p) => p.village && p.village === target.village);
	const rest = others.filter((p) => !(p.village && p.village === target.village));
	return [...sameVillage, ...rest].slice(0, n);
}
var WEEKDAY_NAMES = [
	"",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"日"
];
var TAIPEI_OFFSET_MS = 480 * 60 * 1e3;
function todayWeekdayTaipei() {
	const utcDay = new Date(Date.now() + TAIPEI_OFFSET_MS).getUTCDay();
	return utcDay === 0 ? 7 : utcDay;
}
function todayScheduleEntry(p, weekday = todayWeekdayTaipei()) {
	return p.schedule.find((s) => s.weekday.includes(weekday)) ?? null;
}
//#endregion
//#region src/lib/seo.ts
function faqPageJsonLd(faqs) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: f.answer
			}
		}))
	};
}
function breadcrumbJsonLd(items) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: item.name,
			item: item.url
		}))
	};
}
/**
* 座標超出台灣範圍或缺漏時回傳 null:頁面不得輸出該點的 geo 結構化資料
* (CLAUDE.md 鐵律6,2026-07-09 拍板,避免錯誤地理標記傷害 SEO)。
*/
function placeJsonLd(point, pageUrl) {
	if (!hasValidGeo(point)) return null;
	return {
		"@context": "https://schema.org",
		"@type": "Place",
		name: point.point_name ?? void 0,
		address: point.address ?? void 0,
		geo: {
			"@type": "GeoCoordinates",
			latitude: point.lat,
			longitude: point.lng
		},
		url: pageUrl
	};
}
//#endregion
//#region src/lib/content.ts
/** 依 point_id 產生穩定雜湊,用來在多組文案中選擇變體,避免全站同一句模板換變數。 */
function stableHash(input) {
	let h = 0;
	for (let i = 0; i < input.length; i++) h = h * 31 + input.charCodeAt(i) >>> 0;
	return h;
}
function pick(items, seed) {
	return items[seed % items.length];
}
function weekdayListText(weekday) {
	return weekday.map((d) => `週${WEEKDAY_NAMES[d]}`).join("、");
}
/** 沿街收運且到站/離站時間相同,代表車輛只是經過、不停等,措辭需與定點清運區分(見 CLAUDE.md 台中頁面規則)。 */
function isPassThrough(entry, collectionType) {
	return collectionType === "沿街收運" && entry.arrive === entry.depart;
}
function scheduleTimeText(entry, collectionType) {
	return isPassThrough(entry, collectionType) ? `約 ${entry.arrive} 經過` : `${entry.arrive}〜${entry.depart}`;
}
function todaySummarySentence(point) {
	const weekday = todayWeekdayTaipei();
	const entry = todayScheduleEntry(point, weekday);
	const seed = stableHash(point.point_id);
	const place = point.point_name ?? "這個清運點";
	if (entry) return pick(isPassThrough(entry, point.collection_type) ? [
		`今天(週${WEEKDAY_NAMES[weekday]})垃圾車約 ${entry.arrive} 經過${place},此處為沿街收運、車輛不會停等,請提前在路邊等候。`,
		`today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}為沿街收運路段,垃圾車約 ${entry.arrive} 經過,請提早把垃圾拿到路邊。`,
		`${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,垃圾車約 ${entry.arrive} 經過此路段(沿街收運、不停留),建議提早 5 分鐘到路邊等候。`
	] : [
		`今天(週${WEEKDAY_NAMES[weekday]})垃圾車會來${place},預計 ${entry.arrive}〜${entry.depart} 停靠,請提前在時間內將垃圾拿到定點。`,
		`today-yes: 今天是週${WEEKDAY_NAMES[weekday]},${place}有清運班次,清運車抵達時間約 ${entry.arrive} 至 ${entry.depart},別錯過。`,
		`${place}今天(週${WEEKDAY_NAMES[weekday]})正常收運,時間落在 ${entry.arrive}〜${entry.depart} 之間,建議提早 5 分鐘到定點等候。`
	], seed).replace("today-yes: ", "");
	const scheduledDays = [...new Set(point.schedule.flatMap((s) => s.weekday))].sort((a, b) => a - b);
	const nextDaysText = scheduledDays.length > 0 ? weekdayListText(scheduledDays) : "無固定班次資料";
	return pick([
		`今天(週${WEEKDAY_NAMES[weekday]})${place}沒有排定清運班次,這個點固定收運日為${nextDaysText},請依時刻表安排倒垃圾時間。`,
		`週${WEEKDAY_NAMES[weekday]}垃圾車不會經過${place},此清運點的收運日固定在${nextDaysText}。`,
		`${place}今天(週${WEEKDAY_NAMES[weekday]})休收,下一個收運日請參考本頁時刻表(固定為${nextDaysText})。`
	], seed + 1);
}
function introSentence(point) {
	const seed = stableHash(point.point_id);
	const daysText = weekdayListText([...new Set(point.schedule.flatMap((s) => s.weekday))].sort((a, b) => a - b));
	const times = point.schedule[0];
	if (!times) return `${point.address ?? point.point_name} 位於${point.district}${point.village ?? ""},目前尚無公開時刻資料。`;
	const passThrough = isPassThrough(times, point.collection_type);
	const timeText = scheduleTimeText(times, point.collection_type);
	return pick(passThrough ? [
		`${point.address ?? point.point_name} 是${point.district}的沿街收運路段,垃圾車固定於${daysText} ${timeText},行進中不停等,請提前在路邊準備好垃圾。`,
		`位於${point.village ?? point.district}的「${point.point_name}」,垃圾車在${daysText}會${timeText},此處為沿街收運、車輛不會停留。`,
		`這是${point.district}${point.village ?? ""}的其中一個沿街收運路段,收運日固定在${daysText},垃圾車${timeText},請提早在路邊等候。`
	] : [
		`${point.address ?? point.point_name} 是${point.district}的定點垃圾清運點,固定於${daysText} ${timeText} 收運。`,
		`位於${point.village ?? point.district}的「${point.point_name}」清運點,垃圾車在${daysText}會於 ${timeText} 之間停靠。`,
		`這是${point.district}${point.village ?? ""}的其中一個定點清運站,收運時間固定在${daysText},每次停靠約 ${timeText}。`
	], seed);
}
function buildFaq(point, districtName) {
	const seed = stableHash(point.point_id);
	const missedAnswers = [`若錯過${point.point_name}這班垃圾車,可攜帶垃圾至鄰近清運點(見本頁「鄰近清運點」區塊)在其收運時間內投放,或改於${districtName}清潔隊公告的其他收集地點處理,切勿任意棄置。`, `錯過時間的話,建議查看本頁列出的鄰近清運點是否還在收運時段內;若都已過站,只能等下一個收運日,或洽詢${districtName}清潔隊詢問臨時收運方式。`];
	const recycleAnswers = [`資源回收車通常與一般垃圾車同車次前來,停靠時間與本頁時刻表相同;可回收的紙類、瓶罐、塑膠請分類後交給隨車人員。`, `${districtName}的資源回收多與垃圾車同時段清運,依本頁時刻表的到站時間分類好紙類、寶特瓶、鐵鋁罐等交由清潔隊員即可。`];
	const bulkyAnswers = [`大型垃圾(家具、家電等)需另外向${point.city}環保局預約清運,不可直接放置在本清運點等候,以免影響巷道通行與被開罰。`, `大型廢棄物不在定點清運範圍內,需先上${point.city}環保局網站或電洽預約,由清潔隊安排另外時段到府收運。`];
	return [
		{
			question: "錯過這班垃圾車時間怎麼辦?",
			answer: pick(missedAnswers, seed)
		},
		{
			question: "資源回收車也是這個時間嗎?",
			answer: pick(recycleAnswers, seed + 1)
		},
		{
			question: "大型垃圾可以放在這裡等清運嗎?",
			answer: pick(bulkyAnswers, seed + 2)
		},
		{
			question: "廚餘要怎麼處理?",
			answer: pick([`廚餘通常與一般垃圾同車次收運,請使用專用廚餘桶分裝生廚餘與熟廚餘,於垃圾車抵達時分開交付。`, `本點的廚餘收運時間與一般垃圾相同,請依生廚餘、熟廚餘分類後,在垃圾車抵達時交給清潔隊員。`], seed + 3)
		}
	];
}
//#endregion
//#region src/components/PointPage.astro
createAstro("http://localhost:4321");
var $$PointPage = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$PointPage;
	const { point, group, city, dataMode } = Astro.props;
	const nearby = nearestPoints(point, group.points, 5);
	const faq = buildFaq(point, group.district);
	const pageUrl = Astro.url.href;
	const hasRecycling = !!point.recycling_schedule && point.recycling_schedule.length > 0;
	const jsonLd = [
		breadcrumbJsonLd([
			{
				name: "首頁",
				url: Astro.site ? new URL("/", Astro.site).href : "/"
			},
			{
				name: "垃圾車清運時間查詢",
				url: new URL("/trash/", Astro.site ?? Astro.url).href
			},
			{
				name: city.name,
				url: new URL(`/trash/${city.slug}/`, Astro.site ?? Astro.url).href
			},
			{
				name: group.district,
				url: new URL(`/trash/${city.slug}/${group.districtSlug}/`, Astro.site ?? Astro.url).href
			},
			{
				name: point.point_name ?? point.point_id,
				url: pageUrl
			}
		]),
		faqPageJsonLd(faq),
		placeJsonLd(point, pageUrl)
	].filter(Boolean);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": `${point.point_name}垃圾車時間｜${city.name}${group.district}清運時刻查詢`,
		"description": introSentence(point),
		"jsonLd": jsonLd
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<nav><a href="/">首頁</a> / <a href="/trash/">垃圾車清運時間查詢</a> / <a${addAttribute(`/trash/${city.slug}/`, "href")}>${city.name}</a> / <a${addAttribute(`/trash/${city.slug}/${group.districtSlug}/`, "href")}>${group.district}</a> / ${point.point_name}</nav><p class="poc-note">[PoC・資料存取方式:${dataMode}]</p><h1>${point.point_name}垃圾車時間</h1><p class="today-answer">${todaySummarySentence(point)}</p><p>${introSentence(point)}</p><h2>本週時刻表</h2><table><thead><tr><th>收運日</th><th>到站</th><th>離站</th></tr></thead><tbody>${point.schedule.map((s) => {
			const passThrough = isPassThrough(s, point.collection_type);
			return renderTemplate`<tr><td>${s.weekday.map((d) => `週${WEEKDAY_NAMES[d]}`).join("、")}</td>${passThrough ? renderTemplate`<td colspan="2">約 ${s.arrive} 經過</td>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<td>${s.arrive}</td><td>${s.depart}</td>` })}`}</tr>`;
		})}</tbody></table>${hasRecycling && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<h2>資源回收時刻</h2><table><thead><tr><th>回收日</th><th>到站</th><th>離站</th></tr></thead><tbody>${point.recycling_schedule.map((s) => {
			const passThrough = isPassThrough(s, point.collection_type);
			return renderTemplate`<tr><td>${s.weekday.map((d) => `週${WEEKDAY_NAMES[d]}`).join("、")}</td>${passThrough ? renderTemplate`<td colspan="2">約 ${s.arrive} 經過</td>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<td>${s.arrive}</td><td>${s.depart}</td>` })}`}</tr>`;
		})}</tbody></table>` })}`}<h2>清運方式</h2><p>${point.collection_type}。${point.notes ? point.notes : ""}</p>${point.address && renderTemplate`<p>地址參考:${point.address}</p>`}<h2>鄰近清運點</h2><ul class="plain">${nearby.map((n) => {
			const { pointSlug } = parsePointId(n.point_id);
			const entry = n.schedule[0];
			return renderTemplate`<li><a${addAttribute(`/trash/${city.slug}/${group.districtSlug}/${pointSlug}/`, "href")}>${n.point_name}</a>${entry ? `・${scheduleTimeText(entry, n.collection_type)}` : ""}</li>`;
		})}</ul><h2>${group.district}注意事項</h2><p>請將垃圾裝入合格垃圾袋,於垃圾車抵達前在定點等候,避免提早棄置造成環境問題;資源回收請分類後交給清潔隊員。若時刻有異動,請以${city.name}政府環境保護局公告為準。</p><h2>常見問題</h2>${faq.map((f) => renderTemplate`<details><summary>${f.question}</summary><p>${f.answer}</p></details>`)}`,
		"footer": ($$result) => renderTemplate`<p>資料來源:${city.sourceName}(<a${addAttribute(city.sourceUrl, "href")} rel="noopener">${city.name}政府資料開放平台</a>),依「政府資料開放授權條款第1版」提供。</p><p>本站為民間非官方服務,實際清運時間如有變動,請以清潔隊公告為準。</p>`
	})}`;
}, "/home/junsu/projects/mengwaba/poc-hybrid-render/src/components/PointPage.astro", void 0);
//#endregion
//#region src/lib/types.ts
var CITIES = [{
	slug: "kaohsiung",
	name: "高雄市",
	file: "kaohsiung",
	sourceName: "高雄市政府環境保護局",
	sourceUrl: "https://data.kcg.gov.tw/"
}];
function getCity(slug) {
	const city = CITIES.find((c) => c.slug === slug);
	if (!city) throw new Error(`未知縣市 slug: ${slug}`);
	return city;
}
//#endregion
export { parsePointId as i, $$PointPage as n, groupByDistrict as r, getCity as t };
