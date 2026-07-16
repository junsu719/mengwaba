"""將各來源原始資料正規化為統一 schema(見 ../trash-pseo-spec.md §6)。高雄市、臺中市。"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
NORMALIZED_DIR = ROOT / "data" / "normalized"

WEEKDAY_MAP = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}

# 高雄市資料來源的「行政區」欄位混雜清運分區(如三民東/西、北/南鳳山),
# 對應到標準行政區名稱與 URL slug(拼音)。決策記於 DECISIONS.md。
DISTRICT_MAP = {
    "鹽埕區": ("鹽埕區", "yancheng"),
    "鼓山區": ("鼓山區", "gushan"),
    "左營區": ("左營區", "zuoying"),
    "楠梓區": ("楠梓區", "nanzi"),
    "三民東區": ("三民區", "sanmin"),
    "三民西區": ("三民區", "sanmin"),
    "新興區": ("新興區", "xinxing"),
    "前金區": ("前金區", "qianjin"),
    "苓雅區": ("苓雅區", "lingya"),
    "前鎮區": ("前鎮區", "qianzhen"),
    "旗津區": ("旗津區", "cijin"),
    "小港區": ("小港區", "xiaogang"),
    "北鳳山區": ("鳳山區", "fengshan"),
    "南鳳山區": ("鳳山區", "fengshan"),
    "林園區": ("林園區", "linyuan"),
    "大寮區": ("大寮區", "daliao"),
    "大樹區": ("大樹區", "dashu"),
    "大社區": ("大社區", "dashe"),
    "仁武區": ("仁武區", "renwu"),
    "鳥松區": ("鳥松區", "niaosong"),
    "岡山區": ("岡山區", "gangshan"),
    "橋頭區": ("橋頭區", "qiaotou"),
    "燕巢區": ("燕巢區", "yanchao"),
    "田寮區": ("田寮區", "tianliao"),
    "阿蓮區": ("阿蓮區", "alian"),
    "路竹區": ("路竹區", "luzhu"),
    "湖內區": ("湖內區", "hunei"),
    "茄萣區": ("茄萣區", "qieding"),
    "永安區": ("永安區", "yongan"),
    "彌陀區": ("彌陀區", "mituo"),
    "梓官區": ("梓官區", "ziguan"),
    "旗山區": ("旗山區", "qishan"),
    "美濃區": ("美濃區", "meinong"),
    "六龜區": ("六龜區", "liugui"),
    "甲仙區": ("甲仙區", "jiaxian"),
    "杉林區": ("杉林區", "shanlin"),
    "內門區": ("內門區", "neimen"),
}

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


def parse_schedule_time(raw: str) -> tuple[str | None, str | None]:
    """解析『停留時間』欄位,回傳 (arrive, depart)。格式不合法回傳 (None, None)。"""
    if not raw:
        return None, None
    raw = raw.strip().replace("～", "~").replace("：", ":")
    parts = re.split(r"[~-]", raw)
    if len(parts) == 1:
        t = _normalize_time_token(parts[0])
        return (t, t) if t else (None, None)
    if len(parts) == 2:
        arrive = _normalize_time_token(parts[0])
        depart = _normalize_time_token(parts[1])
        if arrive and depart:
            return arrive, depart
    return None, None


def parse_weekday(raw: str) -> list[int]:
    if not raw:
        return []
    days = []
    for ch in raw.split("、"):
        ch = ch.strip()
        if ch in WEEKDAY_MAP:
            days.append(WEEKDAY_MAP[ch])
    return sorted(set(days))


def parse_float(raw: str) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def normalize_record_kaohsiung(raw: dict[str, Any], seq: int, city: str, source: str, fetched_at: str) -> dict[str, Any]:
    district_raw = (raw.get("行政區") or "").strip()
    district, slug = DISTRICT_MAP.get(district_raw, (None, "unknown"))

    point_name = (raw.get("停留地點") or "").strip() or None
    village = (raw.get("村里") or "").strip() or None

    address = f"{city}{district}{point_name}" if district and point_name else None

    arrive, depart = parse_schedule_time(raw.get("停留時間", ""))
    weekday = parse_weekday(raw.get("回收日", ""))

    schedule = []
    notes_parts = []
    if weekday and arrive and depart:
        schedule.append({"weekday": weekday, "arrive": arrive, "depart": depart})
    else:
        if raw.get("回收日") and not weekday:
            notes_parts.append(f"原始回收日格式異常:{raw.get('回收日')!r}")
        if raw.get("停留時間") and not (arrive and depart):
            notes_parts.append(f"原始停留時間格式異常:{raw.get('停留時間')!r}")

    responsible_area = (raw.get("責任區") or "").strip()
    trip = (raw.get("車次") or "").strip()
    if responsible_area or trip:
        notes_parts.insert(0, f"責任區{responsible_area}・第{trip}車次".strip("・"))

    lat = parse_float(raw.get("緯度"))
    lng = parse_float(raw.get("經度"))

    return {
        "point_id": f"KHH-{slug.upper()}-{seq:05d}",
        "city": city,
        "district": district,
        "village": village,
        "point_name": point_name,
        "address": address,
        "lat": lat,
        "lng": lng,
        "schedule": schedule,
        "collection_type": "定點清運",
        "notes": "、".join(notes_parts) or None,
        "source": source,
        "fetched_at": fetched_at,
    }


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


def normalize_record_taichung(raw: dict[str, Any], seq: int, city: str, source: str, fetched_at: str) -> dict[str, Any] | None:
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

    car_licence = (raw.get("car_licence") or "").strip()
    if car_licence:
        notes_parts.insert(0, f"車牌{car_licence}")

    return {
        "point_id": f"TXG-{slug.upper()}-{seq:05d}",
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
    "kaohsiung": normalize_record_kaohsiung,
    "taichung": normalize_record_taichung,
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
    seq = 0
    for row in payload["records"]:
        record = normalizer(row, seq + 1, city, source, fetched_at)
        if record is None:
            continue
        seq += 1
        normalized.append(record)

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
