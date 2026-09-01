"""行事曆/連假查詢工具 Phase 1:解析 DGPA 辦公日曆表 CSV(dataset/14718)。
來源探勘、下載流程與拍板依據見 DECISIONS.md 2026-08-31 條目。"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "calendar"
OUT_DIR = ROOT / "data" / "normalized" / "calendar"

WEEKDAY_CHARS = {"一", "二", "三", "四", "五", "六", "日"}
WEEKEND_CHARS = {"六", "日"}

HOLIDAY_CODE = "2"
WORKDAY_CODE = "0"

# 備註欄位窮舉白名單(2026.csv/2027.csv 實測涵蓋範圍,2026-08-31 拍板:遇未預期
# 字串一律中止,不用寬鬆字串包含判斷,見 DECISIONS.md)
MEMO_WHITELIST = {
    "開國紀念日",
    "小年夜",
    "農曆除夕",
    "春節",
    "補假",
    "和平紀念日",
    "兒童節",
    "清明節",
    "勞動節",
    "端午節",
    "中秋節",
    "孔子誕辰紀念日/教師節",
    "國慶日",
    "臺灣光復暨金門古寧頭大捷紀念日",
    "行憲紀念日",
}


@dataclass
class Day:
    d: date
    weekday: str
    is_holiday: bool
    memo: str

    def to_dict(self) -> dict:
        out = asdict(self)
        out["d"] = self.d.isoformat()
        return out


def parse_csv(path: Path) -> list[Day]:
    days: list[Day] = []
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            raw_date = row["西元日期"].strip()
            weekday = row["星期"].strip()
            code = row["是否放假"].strip()
            memo = row["備註"].strip()

            if weekday not in WEEKDAY_CHARS:
                raise ValueError(f"未預期的星期值:{weekday!r}(日期 {raw_date})")
            if code not in (HOLIDAY_CODE, WORKDAY_CODE):
                raise ValueError(
                    f"未預期的是否放假代碼:{code!r}(日期 {raw_date})——"
                    "『補假不補班』新制下不應出現 0/2 以外的值,可能代表補班日,需人工確認"
                )
            if memo and memo not in MEMO_WHITELIST:
                raise ValueError(f"備註欄位出現未登錄白名單的字串:{memo!r}(日期 {raw_date})")

            days.append(
                Day(
                    d=date(int(raw_date[:4]), int(raw_date[4:6]), int(raw_date[6:8])),
                    weekday=weekday,
                    is_holiday=code == HOLIDAY_CODE,
                    memo=memo,
                )
            )
    days.sort(key=lambda x: x.d)
    return days


def find_makeup_workdays(days: list[Day]) -> list[Day]:
    """補班日:平常應放假的週末被排為上班日(『補假不補班』新制下理應為 0 筆)。"""
    return [d for d in days if d.weekday in WEEKEND_CHARS and not d.is_holiday]


def find_makeup_holidays(days: list[Day]) -> list[Day]:
    """補假日:備註欄位標為『補假』的放假日。"""
    return [d for d in days if d.memo == "補假"]


def find_long_weekends(days: list[Day], min_len: int = 3) -> list[dict]:
    """找出連續 >= min_len 天的放假區間(起訖日 + 天數 + 名稱)。"""
    runs: list[dict] = []
    i, n = 0, len(days)
    while i < n:
        if not days[i].is_holiday:
            i += 1
            continue
        j = i
        while j + 1 < n and days[j + 1].is_holiday and (days[j + 1].d - days[j].d).days == 1:
            j += 1
        run = days[i : j + 1]
        if len(run) >= min_len:
            runs.append(
                {
                    "start": run[0].d.isoformat(),
                    "end": run[-1].d.isoformat(),
                    "days": len(run),
                    "names": [d.memo for d in run if d.memo],
                }
            )
        i = j + 1
    return runs


def parse_year(year: int) -> dict:
    days = parse_csv(RAW_DIR / f"{year}.csv")
    holidays = [d for d in days if d.is_holiday]
    makeup_workdays = find_makeup_workdays(days)
    makeup_holidays = find_makeup_holidays(days)
    long_weekends = find_long_weekends(days)
    return {
        "year": year,
        "total_days": len(days),
        "holiday_days": len(holidays),
        "makeup_workdays": makeup_workdays,
        "makeup_holidays": makeup_holidays,
        "long_weekends": long_weekends,
        "days": days,
    }


def write_normalized(result: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{result['year']}.json"
    payload = {
        "year": result["year"],
        "total_days": result["total_days"],
        "holiday_days": result["holiday_days"],
        "long_weekends": result["long_weekends"],
        "days": [d.to_dict() for d in result["days"]],
    }
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out_path


def main() -> None:
    for year in (2026, 2027):
        result = parse_year(year)

        if result["makeup_workdays"]:
            print(
                f"[中止] {year} 出現 {len(result['makeup_workdays'])} 筆補班日,"
                "與『補假不補班』新制理解不符,需人工確認",
                file=sys.stderr,
            )
            sys.exit(1)

        out_path = write_normalized(result)

        print(f"=== {year} ===")
        print(f"放假天數:{result['holiday_days']} / {result['total_days']}")
        print(f"補班日:{len(result['makeup_workdays'])} 筆")
        print(f"補假日({len(result['makeup_holidays'])} 筆):")
        for d in result["makeup_holidays"]:
            print(f"  {d.d.isoformat()} ({d.weekday})")
        print(f"連假(>=3 天,{len(result['long_weekends'])} 個):")
        for w in result["long_weekends"]:
            names = "、".join(w["names"]) if w["names"] else ""
            print(f"  {w['start']} ~ {w['end']}({w['days']} 天){' ' + names if names else ''}")
        print(f"已寫出:{out_path.relative_to(ROOT)}")
        print()


if __name__ == "__main__":
    main()
