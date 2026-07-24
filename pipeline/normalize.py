"""將各來源原始資料正規化為統一 schema(見 ../trash-pseo-spec.md §6)。臺中市。

高雄市改走獨立的 pipeline/parse_kaohsiung_pdf.py(PDF 來源,見 DECISIONS.md 2026-07-21:
原本這裡的 CSV-based normalize_record_kaohsiung 已刪除,因為舊 CSV 資料源整份很可能是
資源回收車路線、與一般垃圾車時刻混淆,不應繼續使用或留著誤導後人。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
NORMALIZED_DIR = ROOT / "data" / "normalized"

sys.path.insert(0, str(ROOT))
from pipeline.point_id import assign_point_ids  # noqa: E402

# 臺中市資料源(data.gov.tw/dataset/84004)的「行政區」欄位為 29 區官方全名,
# 與標準行政區一一對應,不像高雄需要合併清運分區。
TAICHUNG_DISTRICT_MAP = {
    "中區": ("中區", "zhongqu"),
    "東區": ("東區", "dongqu"),
    "南區": ("南區", "nanqu"),
    "西區": ("西區", "xiqu"),
    "北區": ("北區", "beiqu"),
    "北屯區": ("北屯區", "beitun"),
    "西屯區": ("西屯區", "xitun"),
    "南屯區": ("南屯區", "nantun"),
    "太平區": ("太平區", "taiping"),
    "大里區": ("大里區", "dali"),
    "霧峰區": ("霧峰區", "wufeng"),
    "烏日區": ("烏日區", "wuri"),
    "豐原區": ("豐原區", "fengyuan"),
    "后里區": ("后里區", "houli"),
    "石岡區": ("石岡區", "shigang"),
    "東勢區": ("東勢區", "dongshi"),
    "和平區": ("和平區", "heping"),
    "新社區": ("新社區", "xinshe"),
    "潭子區": ("潭子區", "tanzi"),
    "大雅區": ("大雅區", "daya"),
    "神岡區": ("神岡區", "shengang"),
    "大肚區": ("大肚區", "dadu"),
    "沙鹿區": ("沙鹿區", "shalu"),
    "龍井區": ("龍井區", "longjing"),
    "梧棲區": ("梧棲區", "wuqi"),
    "清水區": ("清水區", "qingshui"),
    "大甲區": ("大甲區", "dajia"),
    "外埔區": ("外埔區", "waipu"),
    "大安區": ("大安區", "daan"),
}

# 臺中原始資料的 task_type 語意與高雄的「定點清運」不同,需分開標示,
# 避免沿街收運(車輛移動中經過,無固定停留)被頁面誤呈現為精確停留時刻。決策見 DECISIONS.md(2026-07-16)。
TAICHUNG_COLLECTION_TYPE_MAP = {
    "定點": "定點清運",
    "沿街": "沿街收運",
}

# task_type「往廠」為車輛返回焚化廠的內部調度紀錄(caption 恆為「焚化廠號」、
# 全部 g_d/r_d 時間欄位皆空白),非民眾可查詢的清運點,正規化時整筆排除。
# 另有少數 task_type 為「沿街」或「定點」但 caption 同樣是「(進)焚化廠號」的記錄
# (共 10 筆,經人工比對原始資料確認亦為車輛進廠調度、非清運地址),一併以
# caption 關鍵字排除,避免生成無意義的「清運點」頁面。決策見 DECISIONS.md(2026-07-16)。
TAICHUNG_EXCLUDED_TASK_TYPES = {"往廠"}
TAICHUNG_EXCLUDED_CAPTION_KEYWORDS = ("焚化廠號",)

TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _normalize_time_token(token: str) -> str | None:
    token = token.strip().replace("：", ":")
    m = TIME_RE.match(token)
    if not m:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def parse_taichung_daily_schedule(raw: dict[str, Any], prefix: str) -> tuple[list[dict[str, Any]], list[str]]:
    """解析臺中 g_d1..g_d7 / r_d1..r_d7 逐日欄位,回傳 (schedule, 格式異常備註)。

    相同(arrive, depart)的星期合併為同一筆 schedule entry(對齊高雄 schema 慣例);
    時間不同則分開列出,不假設同一停留點每天時間相同。weekday 依 d1=週一…d7=週日
    (依全體資料統計驗證:d7 100% 空白、d3 99.8% 空白,吻合臺中週三、週日公休慣例)。
    """
    day_groups: dict[tuple[str, str], list[int]] = {}
    notes_parts = []
    for weekday in range(1, 8):
        raw_s = raw.get(f"{prefix}_d{weekday}_time_s", "")
        raw_e = raw.get(f"{prefix}_d{weekday}_time_e", "")
        arrive = _normalize_time_token(raw_s) if raw_s else None
        depart = _normalize_time_token(raw_e) if raw_e else None
        if arrive and depart:
            day_groups.setdefault((arrive, depart), []).append(weekday)
        elif raw_s or raw_e:
            notes_parts.append(f"原始{prefix}_d{weekday}時間格式異常:{raw_s!r}/{raw_e!r}")

    schedule = [
        {"weekday": sorted(days), "arrive": arrive, "depart": depart}
        for (arrive, depart), days in day_groups.items()
    ]
    schedule.sort(key=lambda entry: entry["weekday"])
    return schedule, notes_parts


def normalize_record_taichung(raw: dict[str, Any], city: str, source: str, fetched_at: str) -> dict[str, Any] | None:
    """回傳的 record 尚未含 point_id(改由 normalize_city() 收集全部列後,用
    pipeline/point_id.py 批次分配內容雜湊 ID,取代原本的全域序號,見該模組開頭說明)。
    "_district_slug"/"_plate"/"_first_arrive" 為批次分配用的暫存欄位,寫檔前會被移除。
    """
    if raw.get("task_type") in TAICHUNG_EXCLUDED_TASK_TYPES:
        return None

    district_raw = (raw.get("area") or "").strip()
    district, slug = TAICHUNG_DISTRICT_MAP.get(district_raw, (None, "unknown"))

    point_name = (raw.get("caption") or "").strip() or None
    if point_name and any(kw in point_name for kw in TAICHUNG_EXCLUDED_CAPTION_KEYWORDS):
        return None
    village = (raw.get("village") or "").strip() or None

    address = f"{city}{district}{point_name}" if district and point_name else None

    schedule, garbage_notes = parse_taichung_daily_schedule(raw, "g")
    recycling_schedule, recycling_notes = parse_taichung_daily_schedule(raw, "r")

    task_type_raw = (raw.get("task_type") or "").strip()
    collection_type = TAICHUNG_COLLECTION_TYPE_MAP.get(task_type_raw)
    notes_parts = list(garbage_notes) + list(recycling_notes)
    if collection_type is None:
        collection_type = task_type_raw or None
        notes_parts.append(f"原始清運方式無法對應:{task_type_raw!r}")

    car_licence = (raw.get("car_licence") or "").strip() or None
    if car_licence:
        notes_parts.insert(0, f"車牌{car_licence}")

    return {
        "_district_slug": slug,
        "_plate": car_licence,
        "_first_arrive": schedule[0]["arrive"] if schedule else None,
        "city": city,
        "district": district,
        "village": village,
        "point_name": point_name,
        "address": address,
        "lat": None,
        "lng": None,
        "schedule": schedule,
        "recycling_schedule": recycling_schedule,
        "collection_type": collection_type,
        "notes": "、".join(notes_parts) or None,
        "source": source,
        "fetched_at": fetched_at,
    }


NORMALIZERS = {
    "taichung": normalize_record_taichung,
}

# 各 city_key 對應的 point_id 前綴(pipeline/point_id.py 用)。
ID_PREFIXES = {
    "taichung": "TXG",
}


# ============ 桃園市(Phase 4.5 E3,見 DECISIONS.md 完整拍板記錄)============
#
# 與高雄/台中不同,桃園原始資料不是單一 data/raw/{city_key}.json,而是 630 個逐路線檔案
# (data/raw/taoyuan/{gid}__{routing_id}__{car_type}.json,見 fetch_taoyuan_raw.py),
# 故不走 normalize_city() 的單檔載入 + NORMALIZERS 逐列 callback 慣例,改用獨立的
# normalize_taoyuan() 驅動函式,main() 另外分派。

TAOYUAN_RAW_DIR = RAW_DIR / "taoyuan"
TAOYUAN_ROUTES_DIR = TAOYUAN_RAW_DIR / "routes"

# 13 個行政區 gid 對照表,直接取自官方網站首頁下拉選單原文
# (route.tyoem.gov.tw 的 <select id="realtime-gid">/<select id="addr-gid">),
# 非猜測或音譯推算——與 DECISIONS.md E3 記錄的驗證過程一致。
TAOYUAN_DISTRICT_MAP: dict[str, tuple[str, str]] = {
    "lagi2-001": ("蘆竹區", "luzhu"),
    "lagi2-002": ("八德區", "bade"),
    "lagi2-003": ("桃園區", "taoyuan"),
    "lagi2-004": ("中壢區", "zhongli"),
    "lagi2-005": ("平鎮區", "pingzhen"),
    "lagi2-006": ("楊梅區", "yangmei"),
    "lagi2-007": ("大溪區", "daxi"),
    "lagi2-008": ("大園區", "dayuan"),
    "lagi2-009": ("觀音區", "guanyin"),
    "lagi2-010": ("新屋區", "xinwu"),
    "lagi2-011": ("龜山區", "guishan"),
    "lagi2-012": ("龍潭區", "longtan"),
    "lagi2-013": ("復興區", "fuxing"),
}

TAOYUAN_TIME_ONLY_RE = re.compile(r"^班表時間：(\d{1,2}:\d{2})$")
TAOYUAN_WEEKDAY_LINE_RE = re.compile(r"^星期([一二三四五六日,]+)：(\d{1,2}:\d{2})$")
TAOYUAN_BARE_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
TAOYUAN_WEEKDAY_CHAR_TO_ISO = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}


def _parse_taoyuan_weekday_chars(chars: str) -> list[int]:
    return sorted({TAOYUAN_WEEKDAY_CHAR_TO_ISO[c] for c in chars.split(",") if c in TAOYUAN_WEEKDAY_CHAR_TO_ISO})


def _parse_taoyuan_time_field(text: str, fallback_arrive_time: str | None) -> tuple[list[dict[str, Any]], list[str]]:
    """解析 show_arrive_time / show_recycle_arrive_time,回傳 (entries, 丟棄原因清單)。

    兩種已知合法格式(29.4%/70.6% 統計見 DECISIONS.md F1):
      - "班表時間：HH:MM" → 單筆,weekday=[](星期未知,weekday_source 由呼叫端依情境決定)
      - "星期X,Y,Z：HH:MM"(可能多行,不同星期群組各自不同時間)→ 每行各自一筆,weekday_source='listed'
    未知格式一律丟棄該行並記錄原因,不猜測填補(E3-2 拍板)。只有整段文字剛好只有一行、
    且該行解析失敗時,才用同一筆原始記錄的 arrive_time 交叉檢查是否可復原;多行時
    arrive_time 只對應其中一行、無法確定是哪一行,不得亂猜。已知 3 筆來源瑕疵記錄
    (poi_id 24455 的 show_recycle_arrive_time 打字錯多一位數、poi_id 2421 五行中一行
    用分號誤植),前者連 arrive_time 本身也帶著同樣瑕疵、無法復原,後者屬於多行情境,
    兩者最終皆如實記錄「格式異常已捨棄」,不猜測填補。
    """
    if not text:
        return [], []
    lines = [line for line in text.split("\n") if line.strip()]
    entries: list[dict[str, Any]] = []
    drop_reasons: list[str] = []
    for line in lines:
        m_time_only = TAOYUAN_TIME_ONLY_RE.match(line)
        if m_time_only:
            entries.append({"weekday": [], "arrive": m_time_only.group(1)})
            continue
        m_listed = TAOYUAN_WEEKDAY_LINE_RE.match(line)
        if m_listed:
            days = _parse_taoyuan_weekday_chars(m_listed.group(1))
            entries.append({"weekday": days, "arrive": m_listed.group(2)})
            continue
        if len(lines) == 1 and fallback_arrive_time and TAOYUAN_BARE_TIME_RE.match(fallback_arrive_time):
            entries.append({"weekday": [], "arrive": fallback_arrive_time})
            drop_reasons.append(f"格式異常但以 arrive_time 交叉檢查復原:{line!r} -> {fallback_arrive_time}")
        else:
            drop_reasons.append(f"格式異常已捨棄:{line!r}")
    return entries, drop_reasons


def _taoyuan_arrive_time_mismatch(entries: list[dict[str, Any]], bare_arrive_time: str | None) -> bool:
    """僅供 E3-6 報告用的資訊性統計,不影響資料本身:bare arrive_time 與最終採用的
    show_*/show_recycle_* 解析時間是否不一致(多筆時間本屬預期,如實記錄供人工參考)。"""
    if not bare_arrive_time or not TAOYUAN_BARE_TIME_RE.match(bare_arrive_time):
        return False
    parsed_times = {e["arrive"] for e in entries}
    return bool(parsed_times) and bare_arrive_time not in parsed_times


def _decode_taoyuan_recycle_weekday(run_type: str | None) -> list[int]:
    """依官方 route.tyoem.gov.tw/style2015/js/park.js 的
    showRealtimeRecycleCarStatus()/displayRoutingMemo() 兩處邏輯逆向確認(非猜測,已取得
    該站實際 JS 原始碼核對,見 DECISIONS.md E3):run_type 為 7 字元字串,索引依 JS
    `Date.getDay()` 慣例(0=日...6=六),該位置值為 '2' 代表當天有資源回收車。
    回傳值轉換成本站 1=一...7=日 的 ISO weekday 慣例(與 data.ts todayWeekdayTaipei 一致)。
    """
    if not run_type or len(run_type) != 7:
        return []
    return sorted((7 if i == 0 else i) for i, ch in enumerate(run_type) if ch == "2")


def _taoyuan_route_index() -> dict[str, dict[str, str]]:
    """讀取 data/raw/taoyuan/routes/*.json,回傳 routing_id -> {run_type, district_gid} 對照。"""
    index: dict[str, dict[str, str]] = {}
    for route_file in sorted(TAOYUAN_ROUTES_DIR.glob("*.json")):
        gid = route_file.stem
        routes = json.loads(route_file.read_text(encoding="utf-8"))["result"]
        for r in routes:
            index[r["routing_id"]] = {"run_type": r.get("run_type", ""), "district_gid": gid}
    return index


def _taoyuan_mtime_to_iso_date(mtime: float) -> str:
    from datetime import datetime, timedelta, timezone

    tz = timezone(timedelta(hours=8))
    dt = datetime.fromtimestamp(mtime, tz=tz)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def normalize_taoyuan() -> int:
    """桃園市正規化驅動(Phase 4.5 E3,見 DECISIONS.md 完整拍板記錄)。

    E3-1 路線內聯集:同一 routing_id 底下,car_type=lagi 與 car_type=recycle 兩次查詢
    結果依 poi_id 聯集成單一記錄(驗證聯集後共 7,154 筆,與 Jun 已確認數字一致)。
    **不做任何跨路線 poi_id 合併**——已證實 poi_id 並非全域唯一(229 個 poi_id 值橫跨
    多個 routing_id 出現),跨路線比對會誤殺原本各自獨立的清運點;同一實體點被多條路線
    服務者,交由下游「里別+清運點名稱」雜湊 + id-map 消歧自然處理(比照高雄旗津同址
    多筆班次的既有慣例)。
    """
    route_index = _taoyuan_route_index()

    union: dict[tuple[str, int], dict[str, dict[str, Any]]] = {}
    file_mtimes: dict[tuple[str, int], float] = {}
    for raw_file in sorted(TAOYUAN_RAW_DIR.glob("*__*__*.json")):
        m = re.match(r"^(.+)__(.+)__(lagi|recycle)\.json$", raw_file.name)
        if not m:
            continue
        _gid, routing_id, car_type = m.groups()
        payload = json.loads(raw_file.read_text(encoding="utf-8"))
        mtime = raw_file.stat().st_mtime
        for row in payload.get("result", []):
            key = (routing_id, row["poi_id"])
            union.setdefault(key, {})[car_type] = row
            file_mtimes[key] = max(file_mtimes.get(key, 0.0), mtime)

    stats = {
        "union_total": len(union),
        "dropped_missing_district": 0,
        "dropped_empty_both": 0,
        "recycle_only_points": 0,
        "schedule_line_drops": 0,
        "recycling_line_drops": 0,
        "weekday_absent_schedule_entries": 0,
        "weekday_listed_schedule_entries": 0,
        "recycling_weekday_from_run_type": 0,
        "recycling_weekday_absent": 0,
        "recycling_weekday_listed_direct": 0,
        "has_recycling_schedule": 0,
        "served_by_multiple_routes_poi_count": 0,
        "arrive_time_mismatch_count": 0,
        "final_count": 0,
    }

    poi_route_count: dict[int, set[str]] = {}
    for routing_id, poi_id in union:
        poi_route_count.setdefault(poi_id, set()).add(routing_id)
    stats["served_by_multiple_routes_poi_count"] = sum(1 for routes in poi_route_count.values() if len(routes) > 1)

    normalized: list[dict[str, Any]] = []

    for (routing_id, poi_id), by_type in union.items():
        route_info = route_index.get(routing_id)
        district_gid = route_info["district_gid"] if route_info else None
        district_name_slug = TAOYUAN_DISTRICT_MAP.get(district_gid) if district_gid else None
        if not district_name_slug:
            stats["dropped_missing_district"] += 1
            continue
        district, district_slug = district_name_slug

        lagi_row = by_type.get("lagi")
        recycle_row = by_type.get("recycle")
        # 同一 (routing_id, poi_id) 的 poi_name/show_memo/lat/lng 兩次查詢結果一致(已用
        # 全量資料驗證,零筆座標不一致),取任一存在的複本讀共同欄位即可。
        base_row = lagi_row or recycle_row

        point_name = (base_row.get("poi_name") or "").strip() or None
        village = (base_row.get("show_memo") or "").strip() or None  # 空字串統一表示為 None(E3-3)
        lat = base_row.get("lat")
        lng = base_row.get("lng")

        notes_parts: list[str] = []
        schedule: list[dict[str, Any]] = []
        recycling_schedule: list[dict[str, Any]] | None = None

        if lagi_row:
            entries, drops = _parse_taoyuan_time_field(
                lagi_row.get("show_arrive_time", ""), lagi_row.get("arrive_time")
            )
            stats["schedule_line_drops"] += len(drops)
            notes_parts.extend(f"一般垃圾{d}" for d in drops)
            if _taoyuan_arrive_time_mismatch(entries, lagi_row.get("arrive_time")):
                stats["arrive_time_mismatch_count"] += 1
            for e in entries:
                e["depart"] = None  # 來源只有到站時間,無離站時間,不得推算填補(D1 既有拍板)
                if e["weekday"]:
                    e["weekday_source"] = "listed"
                    stats["weekday_listed_schedule_entries"] += 1
                else:
                    e["weekday_source"] = "absent"
                    stats["weekday_absent_schedule_entries"] += 1
            schedule = entries

        if recycle_row:
            entries, drops = _parse_taoyuan_time_field(
                recycle_row.get("show_recycle_arrive_time", ""), recycle_row.get("arrive_time")
            )
            stats["recycling_line_drops"] += len(drops)
            notes_parts.extend(f"資源回收{d}" for d in drops)
            if _taoyuan_arrive_time_mismatch(entries, recycle_row.get("arrive_time")):
                stats["arrive_time_mismatch_count"] += 1
            run_type = route_info.get("run_type") if route_info else None
            for e in entries:
                e["depart"] = None
                if e["weekday"]:
                    # show_recycle_arrive_time 本身已明講星期,直接採用,不需要 run_type。
                    e["weekday_source"] = "listed"
                    stats["recycling_weekday_listed_direct"] += 1
                else:
                    # F1 開頭確立的官方邏輯(park.js 原始碼已核對,見 DECISIONS.md E3):
                    # 資源回收星期一律用 run_type 值=2 的位置解出,不留在「未知」狀態——
                    # 除非 run_type 本身也解不出任何一天(如 lagi2-002_C_5/C_6 純資源回收
                    # 路線,run_type 這套規則對它們不適用),才誠實標記為 absent。
                    decoded = _decode_taoyuan_recycle_weekday(run_type)
                    if decoded:
                        e["weekday"] = decoded
                        e["weekday_source"] = "listed"
                        stats["recycling_weekday_from_run_type"] += 1
                    else:
                        e["weekday_source"] = "absent"
                        stats["recycling_weekday_absent"] += 1
            if entries:
                recycling_schedule = entries
                stats["has_recycling_schedule"] += 1

        if not schedule and not recycling_schedule:
            stats["dropped_empty_both"] += 1
            continue
        if not schedule and recycling_schedule:
            # 純資源回收路線(如 lagi2-002_C_5/C_6):沒有一般垃圾班次,但確實有清運服務,
            # 不得因為 schedule 是空陣列就整筆丟棄(E3-5 regression check 明確要求這類點
            # 要出現在最終結果中)。
            stats["recycle_only_points"] += 1

        mtime = file_mtimes[(routing_id, poi_id)]
        fetched_at = _taoyuan_mtime_to_iso_date(mtime)
        address = f"桃園市{district}{point_name}" if district and point_name else None

        normalized.append(
            {
                "_district_slug": district_slug,
                "_fingerprint": f"{routing_id}:{poi_id}",
                "_route_scope": routing_id,
                "_first_arrive": schedule[0]["arrive"] if schedule else None,
                "city": "桃園市",
                "district": district,
                "village": village,
                "point_name": point_name,
                "address": address,
                "lat": lat,
                "lng": lng,
                "schedule": schedule,
                "recycling_schedule": recycling_schedule,
                "collection_type": None,  # 來源無法區分定點/沿街,不得斷言(D3 既有拍板)
                "notes": "、".join(notes_parts) or None,
                "source": "route.tyoem.gov.tw",
                "fetched_at": fetched_at,
            }
        )

    identity_rows = [
        {
            "district_slug": r["_district_slug"],
            "village": r["village"],
            "point_name": r["point_name"],
            "plate": r["_fingerprint"],
            "route_scope": r["_route_scope"],
            "first_arrive": r["_first_arrive"],
        }
        for r in normalized
    ]
    point_ids = assign_point_ids("taoyuan", "TYN", identity_rows)  # type: ignore[arg-type]
    for i, (record, point_id) in enumerate(zip(normalized, point_ids)):
        del record["_district_slug"]
        del record["_fingerprint"]
        del record["_route_scope"]
        del record["_first_arrive"]
        normalized[i] = {"point_id": point_id, **record}

    stats["final_count"] = len(normalized)

    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = NORMALIZED_DIR / "taoyuan.json"
    out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[normalize] 桃園市:{len(normalized)} 筆已正規化,已寫入 {out_path}")
    print("[normalize] 桃園市統計(E3-6):")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return len(normalized)


def normalize_city(city_key: str) -> int:
    raw_path = RAW_DIR / f"{city_key}.json"
    if not raw_path.exists():
        print(f"[normalize] 找不到原始資料 {raw_path},請先執行 fetch.py", file=sys.stderr)
        sys.exit(1)
    normalizer = NORMALIZERS.get(city_key)
    if normalizer is None:
        print(f"[normalize] 未知的 city_key: {city_key!r}(可用: {', '.join(NORMALIZERS)})", file=sys.stderr)
        sys.exit(1)

    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    city = payload["city"]
    source = payload["source"]
    fetched_at = payload["fetched_at"]

    normalized = []
    for row in payload["records"]:
        record = normalizer(row, city, source, fetched_at)
        if record is None:
            continue
        normalized.append(record)

    identity_rows = [
        {
            "district_slug": r["_district_slug"],
            "village": r["village"],
            "point_name": r["point_name"],
            "plate": r["_plate"],
            "first_arrive": r["_first_arrive"],
        }
        for r in normalized
    ]
    point_ids = assign_point_ids(city_key, ID_PREFIXES[city_key], identity_rows)  # type: ignore[arg-type]
    for i, (record, point_id) in enumerate(zip(normalized, point_ids)):
        del record["_district_slug"]
        del record["_plate"]
        del record["_first_arrive"]
        # 欄位順序:point_id 放最前面,對齊既有 schema 慣例
        normalized[i] = {"point_id": point_id, **record}

    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = NORMALIZED_DIR / f"{city_key}.json"
    out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[normalize] {city}:{len(normalized)} 筆已正規化,已寫入 {out_path}")
    return len(normalized)


def main() -> None:
    city_keys = sys.argv[1:]
    if not city_keys:
        print("[normalize] 用法: python pipeline/normalize.py <city_key> [city_key ...]", file=sys.stderr)
        print(f"[normalize] 可用 city_key: {', '.join(list(NORMALIZERS) + ['taoyuan'])}", file=sys.stderr)
        sys.exit(1)

    for city_key in city_keys:
        if city_key == "taoyuan":
            normalize_taoyuan()
        else:
            normalize_city(city_key)


if __name__ == "__main__":
    main()
