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
        print(f"[normalize] 可用 city_key: {', '.join(NORMALIZERS)}", file=sys.stderr)
        sys.exit(1)

    for city_key in city_keys:
        normalize_city(city_key)


if __name__ == "__main__":
    main()
