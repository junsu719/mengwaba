"""三層資料驗證(見 ../trash-pseo-spec.md §7)。驗證失敗即中止,絕不部署。"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.notify import notify_failure  # noqa: E402

NORMALIZED_DIR = ROOT / "data" / "normalized"
META_PATH = ROOT / "data" / "meta.json"
TAIPEI_TZ = timezone(timedelta(hours=8))

L1_MIN_COMPLETENESS = 0.95
L2_MAX_VIOLATION_RATE = 0.05
L3_MAX_CHANGE_RATE = 0.30

TAIWAN_LAT_RANGE = (21.5, 25.5)
TAIWAN_LNG_RANGE = (119.5, 122.5)


def check_l1_structure(records: list[dict[str, Any]]) -> dict[str, Any]:
    required = ["city", "district", "point_name", "schedule"]
    complete = 0
    for r in records:
        if all(r.get(f) for f in required):
            complete += 1
    rate = complete / len(records) if records else 0.0
    return {
        "layer": "L1_structure",
        "required_fields": required,
        "total": len(records),
        "complete": complete,
        "completeness_rate": round(rate, 4),
        "threshold": L1_MIN_COMPLETENESS,
        "passed": rate >= L1_MIN_COMPLETENESS,
    }


def check_l2_reasonableness(records: list[dict[str, Any]]) -> dict[str, Any]:
    time_violations = 0
    weekday_violations = 0
    coord_checked = 0
    coord_violations = 0

    for r in records:
        for entry in r.get("schedule", []):
            arrive, depart = entry.get("arrive"), entry.get("depart")
            for t in (arrive, depart):
                if not _is_valid_time(t):
                    time_violations += 1
            wd = entry.get("weekday", [])
            if not wd or any(d < 1 or d > 7 for d in wd):
                weekday_violations += 1

        lat, lng = r.get("lat"), r.get("lng")
        if lat is not None and lng is not None:
            coord_checked += 1
            if not (TAIWAN_LAT_RANGE[0] <= lat <= TAIWAN_LAT_RANGE[1]) or not (
                TAIWAN_LNG_RANGE[0] <= lng <= TAIWAN_LNG_RANGE[1]
            ):
                coord_violations += 1

    coord_violation_rate = coord_violations / coord_checked if coord_checked else 0.0
    return {
        "layer": "L2_reasonableness",
        "time_violations": time_violations,
        "weekday_violations": weekday_violations,
        "coord_checked": coord_checked,
        "coord_violations": coord_violations,
        "coord_violation_rate": round(coord_violation_rate, 4),
        "threshold": L2_MAX_VIOLATION_RATE,
        "passed": coord_violation_rate <= L2_MAX_VIOLATION_RATE,
    }


def _is_valid_time(t: str | None) -> bool:
    if not t or not isinstance(t, str) or len(t) != 5 or t[2] != ":":
        return False
    try:
        h, m = int(t[:2]), int(t[3:])
    except ValueError:
        return False
    return 0 <= h <= 23 and 0 <= m <= 59


def check_l3_diff(city_key: str, current_count: int, meta: dict[str, Any]) -> dict[str, Any]:
    prev_entry = meta.get(city_key)
    if not prev_entry:
        return {
            "layer": "L3_diff",
            "previous_count": None,
            "current_count": current_count,
            "change_rate": None,
            "threshold": L3_MAX_CHANGE_RATE,
            "passed": True,
            "note": "首次執行,無前日基準,略過 L3 比對",
        }
    prev_count = prev_entry["count"]
    change_rate = abs(current_count - prev_count) / prev_count if prev_count else 1.0
    return {
        "layer": "L3_diff",
        "previous_count": prev_count,
        "current_count": current_count,
        "change_rate": round(change_rate, 4),
        "threshold": L3_MAX_CHANGE_RATE,
        "passed": change_rate <= L3_MAX_CHANGE_RATE,
    }


def main() -> None:
    city_key = "kaohsiung"
    city_name = "高雄市"
    normalized_path = NORMALIZED_DIR / f"{city_key}.json"
    if not normalized_path.exists():
        print(f"[validate] 找不到正規化資料 {normalized_path},請先執行 normalize.py", file=sys.stderr)
        sys.exit(1)

    records = json.loads(normalized_path.read_text(encoding="utf-8"))
    meta = json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else {}

    l1 = check_l1_structure(records)
    l2 = check_l2_reasonableness(records)
    l3 = check_l3_diff(city_key, len(records), meta)

    report = {
        "city": city_name,
        "validated_at": datetime.now(TAIPEI_TZ).isoformat(),
        "total_records": len(records),
        "checks": [l1, l2, l3],
        "passed": l1["passed"] and l2["passed"] and l3["passed"],
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))

    if not report["passed"]:
        failed_layers = [c["layer"] for c in report["checks"] if not c["passed"]]
        detail = f"{city_name} 驗證失敗:{', '.join(failed_layers)}"
        notify_failure("validate", detail)
        print(f"[validate] {detail}", file=sys.stderr)
        sys.exit(1)

    meta[city_key] = {
        "city": city_name,
        "count": len(records),
        "updated_at": report["validated_at"],
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[validate] {city_name}:全部通過,已更新 {META_PATH}")


if __name__ == "__main__":
    main()
