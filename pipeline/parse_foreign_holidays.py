"""外國節日比對功能:解析 data/raw/foreign-holidays/ 的日本內閣府 CSV 與新加坡 MOM CSV,
輸出 data/normalized/foreign-holidays/{jp,sg}.json。
驗證失敗一律中止(沿用專案鐵律:驗證失敗不往下走)。只取 YEARS 內的年份。"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "foreign-holidays"
OUT_DIR = ROOT / "data" / "normalized" / "foreign-holidays"

YEARS = (2026, 2027)
SG_DAY_NAMES = {0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"}


def parse_jp() -> list[dict]:
    path = RAW_DIR / "syukujitsu.csv"
    # 內閣府 CSV 為 Shift_JIS(cp932 為其超集,涵蓋所有可能字元)
    text = path.read_bytes().decode("cp932")
    rows = list(csv.reader(text.splitlines()))
    if rows[0] != ["国民の祝日・休日月日", "国民の祝日・休日名称"]:
        sys.exit(f"JP 表頭非預期: {rows[0]}")
    out: list[dict] = []
    for r in rows[1:]:
        if len(r) != 2:
            sys.exit(f"JP 列欄位數非預期: {r}")
        y, m, d = (int(x) for x in r[0].split("/"))
        if y not in YEARS:
            continue
        out.append({"d": date(y, m, d).isoformat(), "name": r[1]})
    return out


def parse_sg(year: int) -> list[dict]:
    path = RAW_DIR / f"sg-public-holidays-{year}.csv"
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != ["date", "day", "holiday"]:
            sys.exit(f"SG {year} 表頭非預期: {reader.fieldnames}")
        out: list[dict] = []
        for r in reader:
            dt = date.fromisoformat(r["date"])
            if dt.year != year:
                sys.exit(f"SG {year} 出現非本年度日期: {r}")
            if SG_DAY_NAMES[dt.weekday()] != r["day"]:
                sys.exit(f"SG 星期與日期不符: {r}")
            out.append({"d": dt.isoformat(), "name": r["holiday"]})
    return out


def check_unique(country: str, rows: list[dict]) -> None:
    seen = set()
    for r in rows:
        key = (r["d"], r["name"])
        if key in seen:
            sys.exit(f"{country} 重複列: {key}")
        seen.add(key)
    if [r["d"] for r in rows] != sorted(r["d"] for r in rows):
        sys.exit(f"{country} 未依日期排序")


def sg_meta(year: int) -> dict:
    m = json.loads((RAW_DIR / f"sg-public-holidays-{year}.metadata.json").read_text(encoding="utf-8"))["data"]
    return {"datasetId": m["datasetId"], "name": m["name"], "managedBy": m["managedBy"], "lastUpdatedAt": m["lastUpdatedAt"]}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jp = parse_jp()
    check_unique("JP", jp)
    sg: list[dict] = []
    for y in YEARS:
        sg += parse_sg(y)
    check_unique("SG", sg)

    def dump(name: str, obj: dict) -> None:
        (OUT_DIR / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    dump("jp.json", {"country": "jp", "holidays": jp})
    dump("sg.json", {"country": "sg", "datasets": {str(y): sg_meta(y) for y in YEARS}, "holidays": sg})
    for y in YEARS:
        print(f"JP {y}: {sum(1 for r in jp if r['d'].startswith(str(y)))}  SG {y}: {sum(1 for r in sg if r['d'].startswith(str(y)))}")


if __name__ == "__main__":
    main()
