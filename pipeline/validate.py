"""三層資料驗證(見 ../trash-pseo-spec.md §7)。驗證失敗即中止,絕不部署。高雄市、臺中市。"""

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
    # normalize.py 逐筆標記的資料來源依據(見 DECISIONS.md F1/F2),不是用「值長什麼樣子」猜測:
    # 'listed'  = 來源本身有明確星期清單(如高雄/台中逐日欄位),解析後理應非空;
    # 'absent'  = 來源本身只有「班表時間:HH:MM」、天生沒有逐日星期欄位(如桃園 70.6% 記錄),
    #             解析後預期就是空陣列,不是資料壞掉;
    # 'unspecified' = 尚未套用此標記的舊 pipeline(現有高雄/台中 normalize_record_* 尚未加這個
    #             欄位),維持原本「非空且值域合法才算正常」的把關方式,避免對舊資料放寬。
    weekday_source_counts: dict[str, int] = {"listed": 0, "absent": 0, "unspecified": 0}
    coord_checked = 0
    coord_violations = 0

    for r in records:
        # `.get(key, [])` 只在缺 key 時才回退到預設值,recycling_schedule 明確存 null 時
        # (見 DECISIONS.md D4:查無資源回收資料時如實存 NULL,非缺欄位)會直接回傳 None,
        # 與 list 相加即 TypeError——高雄/台中至今未實際存過 null 才沒觸發過,桃園會是
        # 第一個真的用上 null 的縣市,改用 `or []` 讓 None 與缺 key 都正確回退。
        # foodscraps_schedule(2026-07-28 新北市新增維度,見 DECISIONS.md)缺 key 時
        # `.get(...) or []` 安全回退成空陣列,對既有高雄/台中/桃園資料無影響。
        for entry in (
            (r.get("schedule") or [])
            + (r.get("recycling_schedule") or [])
            + (r.get("foodscraps_schedule") or [])
        ):
            arrive, depart = entry.get("arrive"), entry.get("depart")
            # depart 可為 null 是既定資料形狀(見 DECISIONS.md D1、site/src/lib/data.ts
            # ScheduleEntry.depart 註解:部分縣市如桃園只有到站時間、無離站時間,不得推算填補),
            # null 不算格式異常;arrive 則任何情況都必須是合法時間,無此彈性。
            if not _is_valid_time(arrive):
                time_violations += 1
            if depart is not None and not _is_valid_time(depart):
                time_violations += 1

            wd = entry.get("weekday", [])
            wd_source = entry.get("weekday_source", "unspecified")
            weekday_source_counts[wd_source] = weekday_source_counts.get(wd_source, 0) + 1

            if wd_source == "absent":
                # 來源標記已說明這筆天生沒有星期資訊,空陣列是預期值;若解析器卻生出非空 weekday,
                # 代表標記與實際結果矛盾,那才是真正的異常。
                if wd:
                    weekday_violations += 1
            else:
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
    # 每季執行都會印出這個比例分佈,供人工比對「上一季 vs 這一季」是否有明顯變動——
    # 例如某縣市 absent 佔比忽然從 70% 掉到 20%,代表官方資料來源格式本身變了,值得追查,
    # 而不是等頁面出現奇怪內容才發現(見 DECISIONS.md F1/F2)。
    total_weekday_entries = sum(weekday_source_counts.values())
    weekday_source_rates = {
        k: round(v / total_weekday_entries, 4) if total_weekday_entries else 0.0
        for k, v in weekday_source_counts.items()
    }
    return {
        "layer": "L2_reasonableness",
        "time_violations": time_violations,
        "weekday_violations": weekday_violations,
        "weekday_source_counts": weekday_source_counts,
        "weekday_source_rates": weekday_source_rates,
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


def validate_city(city_key: str, meta: dict[str, Any]) -> dict[str, Any]:
    normalized_path = NORMALIZED_DIR / f"{city_key}.json"
    if not normalized_path.exists():
        print(f"[validate] 找不到正規化資料 {normalized_path},請先執行 normalize.py", file=sys.stderr)
        sys.exit(1)

    records = json.loads(normalized_path.read_text(encoding="utf-8"))
    city_name = records[0]["city"] if records else city_key

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
    print(f"[validate] {city_name}:全部通過")
    return report


def main() -> None:
    city_keys = sys.argv[1:]
    if not city_keys:
        print("[validate] 用法: python pipeline/validate.py <city_key> [city_key ...]", file=sys.stderr)
        sys.exit(1)

    meta = json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else {}
    for city_key in city_keys:
        validate_city(city_key, meta)

    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[validate] 已更新 {META_PATH}")


if __name__ == "__main__":
    main()
