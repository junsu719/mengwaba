"""將各來源原始資料正規化為統一 schema(見 ../trash-pseo-spec.md §6)。目前僅實作高雄市。"""

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


def normalize_record(raw: dict[str, Any], seq: int, city: str, source: str, fetched_at: str) -> dict[str, Any]:
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


def main() -> None:
    raw_path = RAW_DIR / "kaohsiung.json"
    if not raw_path.exists():
        print(f"[normalize] 找不到原始資料 {raw_path},請先執行 fetch.py", file=sys.stderr)
        sys.exit(1)

    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    city = payload["city"]
    source = payload["source"]
    fetched_at = payload["fetched_at"]

    normalized = [
        normalize_record(row, seq, city, source, fetched_at)
        for seq, row in enumerate(payload["records"], start=1)
    ]

    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = NORMALIZED_DIR / "kaohsiung.json"
    out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[normalize] 高雄市:{len(normalized)} 筆已正規化,已寫入 {out_path}")


if __name__ == "__main__":
    main()
