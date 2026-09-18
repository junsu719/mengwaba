"""獨立資料產生腳本:2020-2040 年農曆靜態資料(每日對照 + 傳統節日對照)。

前提(已於 scripts/verify_lunar_leap_month.py 驗證通過,見該腳本說明):
- 節氣:72 筆對 67 筆完全相符,5 筆差 1 分鐘(秒數四捨五入門檻,非演算法差異)
- 閏月:2025 乙巳年閏六月、384 日,與 CWA 民國 114 年日曆資料表相符;
  對照組 2026 丙午年、2027 丁未年皆 354 日、無閏月
- 已知 API 陷阱:LunarYear.getMonths() 用「歲」邊界(以冬至為界),
  非民間農曆年邊界,本腳本不使用該方法

不動 pipeline/parse_calendar.py、不動現有 pipeline,獨立輸出到 data/processed/lunar/。
產生後屬靜態資料,不需重算;此腳本可重複執行以重新產生(冪等)。

農曆年邊界(正確性問題 1):以正月初一為界,非冬至。經查證,lunar_python 的
Lunar.getYear() / getYearInGanZhi() / getYearShengXiao()(不含 ByLiChun 變體)
三者皆已用此邊界(2025-01-28 → 2024/甲辰/龍,2025-01-29 → 2025/乙巳/蛇,
實測見下方 self-check f),故直接採用,不需自行改寫年份判定邏輯。

繁簡轉換(正確性問題 2):24 節氣中僅 5 個簡繁字形不同(見 TRAD_TERM_MAP),
其餘 19 個節氣簡繁同形,故用窮舉字典轉換,不引入 OpenCC 依賴。轉換後另外
自我檢查「全資料集出現的節氣名稱,去重後應恰為 24 個標準繁體節氣名稱」,
確保沒有漏掉未預期的簡繁差異。

節氣秒數(正確性問題 3):本次兩份輸出檔皆不含節氣時刻欄位(每日表只要「當日
是否為節氣」的節氣名稱,節日表的清明/冬至也只需日期),故無需在此腳本內處理
分鐘四捨五入;該規則已在 scripts/verify_lunar_leap_month.py 節氣驗證階段套用過。

除夕(正確性問題「不可寫死三十」):定義為「隔年正月初一的前一天」,不假設
農曆十二月固定 29 或 30 天,直接用 Solar 的儒略日運算取得,天數由函式庫決定。

清明/冬至(正確性問題「不可用農曆日期推算」):兩者皆從每日表中「當日節氣」
欄位(solar_term)比對取得,不用固定的農曆月/日反推。
"""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path

from lunar_python import Lunar, LunarMonth, Solar

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "processed" / "lunar"

START_DATE = dt.date(2020, 1, 1)
END_DATE = dt.date(2040, 12, 31)

LEAP_YEARS_EXPECTED = {2020, 2023, 2025, 2028, 2031, 2033, 2036, 2039}
FESTIVAL_YEARS = range(2020, 2041)

CHINESE_NUM = {
    1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六",
    7: "七", 8: "八", 9: "九", 10: "十", 11: "十一", 12: "十二",
}

# lunar_python 的節氣名稱(getJieQi())為簡體;24 節氣中僅以下 5 個簡繁字形不同,
# 其餘 19 個簡繁同形,直接原樣輸出即可。
TRAD_TERM_MAP = {
    "惊蛰": "驚蟄",
    "谷雨": "穀雨",
    "小满": "小滿",
    "芒种": "芒種",
    "处暑": "處暑",
}

CANONICAL_24_TERMS_TRAD = [
    "小寒", "大寒", "立春", "雨水", "驚蟄", "春分", "清明", "穀雨",
    "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑",
    "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
]


def to_traditional_term(term: str) -> str:
    return TRAD_TERM_MAP.get(term, term)


# 12 生肖中僅以下 4 個簡繁字形不同(其餘 8 個同形),同樣用窮舉字典轉換,
# 不引入 OpenCC 依賴。使用者給的範例「蛇」剛好簡繁同形,未暴露此問題,
# 但其餘欄位(干支、月份/日期標籤、節氣、節日名)皆已輸出繁體,生肖留簡體
# 會與整份資料不一致,故一併轉換。
ZODIAC_TRAD_MAP = {
    "龙": "龍",
    "马": "馬",
    "鸡": "雞",
    "猪": "豬",
}


def to_traditional_zodiac(zodiac: str) -> str:
    return ZODIAC_TRAD_MAP.get(zodiac, zodiac)


def month_label(month: int, is_leap: bool) -> str:
    return ("閏" if is_leap else "") + CHINESE_NUM[month] + "月"


def daterange(start: dt.date, end: dt.date):
    d = start
    one_day = dt.timedelta(days=1)
    while d <= end:
        yield d
        d += one_day


def build_daily_rows() -> list[dict]:
    rows: list[dict] = []
    for d in daterange(START_DATE, END_DATE):
        solar = Solar.fromYmd(d.year, d.month, d.day)
        lunar = solar.getLunar()

        raw_month = lunar.getMonth()
        is_leap_month = raw_month < 0
        lunar_month = abs(raw_month)

        term_raw = lunar.getJieQi()
        solar_term = to_traditional_term(term_raw) if term_raw else ""

        rows.append({
            "solar_date": d.isoformat(),
            "lunar_year": lunar.getYear(),
            "lunar_month": lunar_month,
            "lunar_day": lunar.getDay(),
            "is_leap_month": is_leap_month,
            "lunar_month_label": month_label(lunar_month, is_leap_month),
            "lunar_day_label": lunar.getDayInChinese(),
            "ganzhi": lunar.getYearInGanZhi(),
            "zodiac": to_traditional_zodiac(lunar.getYearShengXiao()),
            "solar_term": solar_term,
        })
    return rows


def build_festival_rows(daily_rows: list[dict]) -> list[dict]:
    # 清明/冬至用每日表的節氣欄位反查,不用農曆日期推算(見檔頭說明)。
    term_lookup: dict[tuple[int, str], str] = {}
    for row in daily_rows:
        if row["solar_term"] in ("清明", "冬至"):
            term_lookup[(row["lunar_year"], row["solar_term"])] = row["solar_date"]

    festival_rows: list[dict] = []

    def add(year: int, name: str, solar_date_str: str) -> None:
        # 除夕/正月初一~初五/元宵等節日可能跨西元年(如 2020 農曆年的除夕落在
        # 西元 2021 年),用 lunar_year 查「N 年除夕」會查錯,故另加 solar_year
        # 欄位取自 solar_date 本身的西元年份,後續查詢一律以 solar_year 為準。
        festival_rows.append({
            "solar_year": int(solar_date_str[:4]),
            "lunar_year": year,
            "festival": name,
            "solar_date": solar_date_str,
        })

    for year in FESTIVAL_YEARS:
        # 除夕:隔年正月初一的前一天,不假設農曆十二月固定天數。
        next_new_year_solar = Lunar.fromYmd(year + 1, 1, 1).getSolar()
        chuxi_solar = Solar.fromJulianDay(next_new_year_solar.getJulianDay() - 1)
        add(year, "除夕", chuxi_solar.toString())

        for day, name in [(1, "正月初一"), (2, "正月初二"), (3, "正月初三"),
                           (4, "正月初四"), (5, "正月初五"), (15, "元宵")]:
            add(year, name, Lunar.fromYmd(year, 1, day).getSolar().toString())

        add(year, "端午", Lunar.fromYmd(year, 5, 5).getSolar().toString())
        add(year, "七夕", Lunar.fromYmd(year, 7, 7).getSolar().toString())
        add(year, "中元", Lunar.fromYmd(year, 7, 15).getSolar().toString())
        add(year, "中秋", Lunar.fromYmd(year, 8, 15).getSolar().toString())
        add(year, "重陽", Lunar.fromYmd(year, 9, 9).getSolar().toString())

        for name in ("清明", "冬至"):
            key = (year, name)
            if key not in term_lookup:
                raise AssertionError(f"找不到 {year} 年的節氣「{name}」,無法從每日表反查")
            add(year, name, term_lookup[key])

    return festival_rows


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            out = dict(row)
            if "is_leap_month" in out:
                out["is_leap_month"] = "true" if out["is_leap_month"] else "false"
            writer.writerow(out)


def self_check(daily_rows: list[dict], festival_rows: list[dict]) -> list[str]:
    report: list[str] = []
    ok = True

    def check(label: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and passed
        mark = "PASS" if passed else "FAIL"
        report.append(f"[{mark}] {label}" + (f":{detail}" if detail else ""))

    # a. 總筆數、無缺漏無重複
    expected_days = (END_DATE - START_DATE).days + 1
    dates_seen = [r["solar_date"] for r in daily_rows]
    unique_dates = set(dates_seen)
    consecutive = all(
        dt.date.fromisoformat(dates_seen[i]) - dt.date.fromisoformat(dates_seen[i - 1]) == dt.timedelta(days=1)
        for i in range(1, len(dates_seen))
    )
    check(
        "a. 每日資料總筆數無缺漏無重複",
        len(daily_rows) == expected_days and len(unique_dates) == expected_days and consecutive,
        f"筆數={len(daily_rows)} 預期={expected_days} 去重後={len(unique_dates)} 日期連續={consecutive}",
    )

    # b. 每個農曆月的日數只能是 29 或 30
    # 注意:不能直接用「該月在資料視窗內觀察到的最大 lunar_day」來判斷,
    # 因為資料視窗頭尾各有一個被截斷的月份(2020-01-01 非該農曆月初一、
    # 2040-12-31 非該農曆月最後一日),視窗內的最大值會小於實際月長度而誤判。
    # 改用函式庫權威值(LunarMonth.getDayCount())逐一核對每個出現過的月份。
    seen_months = {(r["lunar_year"], r["is_leap_month"], r["lunar_month"]) for r in daily_rows}
    bad_months = {}
    for lunar_year, is_leap, lunar_month in seen_months:
        month_num = -lunar_month if is_leap else lunar_month
        actual_count = LunarMonth.fromYm(lunar_year, month_num).getDayCount()
        if actual_count not in (29, 30):
            bad_months[(lunar_year, is_leap, lunar_month)] = actual_count
    check("b. 每個農曆月天數只有 29 或 30", len(bad_months) == 0, f"異常月份={bad_months}" if bad_months else f"全部符合(共 {len(seen_months)} 個月份)")

    # c. 每年(國曆年)恰有 24 個節氣
    term_counts: dict[int, int] = {}
    term_names_by_year: dict[int, set] = {}
    for r in daily_rows:
        if r["solar_term"]:
            y = int(r["solar_date"][:4])
            term_counts[y] = term_counts.get(y, 0) + 1
            term_names_by_year.setdefault(y, set()).add(r["solar_term"])
    bad_years = {y: c for y, c in term_counts.items() if c != 24}
    check("c. 每個國曆年恰有 24 個節氣", len(bad_years) == 0, f"異常年份={bad_years}" if bad_years else "全部符合")

    # 額外:節氣名稱去重後應恰為 24 個標準繁體名稱(交叉驗證繁簡轉換完整性)
    all_term_names = set()
    for names in term_names_by_year.values():
        all_term_names |= names
    check(
        "g(額外). 全資料集節氣名稱去重後 = 24 個標準繁體名稱",
        all_term_names == set(CANONICAL_24_TERMS_TRAD),
        f"實際集合與標準集合差異:{all_term_names.symmetric_difference(set(CANONICAL_24_TERMS_TRAD))}"
        if all_term_names != set(CANONICAL_24_TERMS_TRAD) else "完全一致",
    )

    # 額外:生肖名稱去重後應恰為 12 個標準繁體生肖(交叉驗證繁簡轉換完整性)
    canonical_zodiacs = {"鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"}
    all_zodiacs = {r["zodiac"] for r in daily_rows}
    check(
        "h(額外). 全資料集生肖名稱去重後 = 12 個標準繁體生肖",
        all_zodiacs == canonical_zodiacs,
        f"實際集合與標準集合差異:{all_zodiacs.symmetric_difference(canonical_zodiacs)}"
        if all_zodiacs != canonical_zodiacs else "完全一致",
    )

    # d. 8 個閏月年在每日資料中確實出現 is_leap_month = true
    leap_years_found = {r["lunar_year"] for r in daily_rows if r["is_leap_month"]}
    missing = LEAP_YEARS_EXPECTED - leap_years_found
    extra = leap_years_found - LEAP_YEARS_EXPECTED
    check(
        "d. 8 個閏月年皆出現 is_leap_month=true",
        len(missing) == 0 and len(extra) == 0,
        f"缺少={missing or '無'} 多出={extra or '無'}",
    )

    # e. 2025-07-25 應為閏六月初一
    row_e = next(r for r in daily_rows if r["solar_date"] == "2025-07-25")
    check(
        "e. 2025-07-25 為閏六月初一",
        row_e["is_leap_month"] is True and row_e["lunar_month"] == 6 and row_e["lunar_day"] == 1,
        f"實際={row_e['lunar_month_label']}{row_e['lunar_day_label']} is_leap={row_e['is_leap_month']}",
    )

    # f. 農曆年邊界抽驗
    row_f1 = next(r for r in daily_rows if r["solar_date"] == "2025-01-28")
    row_f2 = next(r for r in daily_rows if r["solar_date"] == "2025-01-29")
    check(
        "f. 2025-01-28 甲辰 / 2025-01-29 乙巳",
        row_f1["ganzhi"] == "甲辰" and row_f2["ganzhi"] == "乙巳",
        f"01-28={row_f1['ganzhi']} 01-29={row_f2['ganzhi']}",
    )

    # i. 除夕 + 1 天 = 該農曆年下一年的正月初一(2020-2039;2040 除夕的初一
    # 落在 2041,超出本次節日表產生範圍 range(2020,2041),故排除)
    chuxi_by_year = {r["lunar_year"]: r["solar_date"] for r in festival_rows if r["festival"] == "除夕"}
    new_year_by_year = {r["lunar_year"]: r["solar_date"] for r in festival_rows if r["festival"] == "正月初一"}
    bad_continuity = {}
    for year in range(2020, 2040):
        chuxi_date = dt.date.fromisoformat(chuxi_by_year[year])
        next_new_year_date_str = new_year_by_year.get(year + 1)
        expected = (chuxi_date + dt.timedelta(days=1)).isoformat()
        if next_new_year_date_str is None or next_new_year_date_str != expected:
            bad_continuity[year] = {
                "除夕": chuxi_by_year[year],
                "除夕+1天": expected,
                f"{year + 1}年正月初一": next_new_year_date_str,
            }
    check(
        "i. 除夕+1天 = 隔年正月初一(2020-2039)",
        len(bad_continuity) == 0,
        f"不連續的年份={bad_continuity}" if bad_continuity else "全部符合(20 組)",
    )

    report.append("")
    report.append("過關" if ok else "未過關")
    return report, ok


def main() -> int:
    daily_rows = build_daily_rows()
    festival_rows = build_festival_rows(daily_rows)

    daily_path = OUT_DIR / "lunar_daily_2020_2040.csv"
    festival_path = OUT_DIR / "lunar_festivals_2020_2040.csv"

    write_csv(
        daily_path,
        daily_rows,
        ["solar_date", "lunar_year", "lunar_month", "lunar_day", "is_leap_month",
         "lunar_month_label", "lunar_day_label", "ganzhi", "zodiac", "solar_term"],
    )
    write_csv(festival_path, festival_rows, ["solar_year", "lunar_year", "festival", "solar_date"])

    print(f"已輸出:{daily_path}({len(daily_rows)} 列)")
    print(f"已輸出:{festival_path}({len(festival_rows)} 列)")
    print()

    print("=== 自我檢查報告 ===")
    report_lines, ok = self_check(daily_rows, festival_rows)
    print("\n".join(report_lines))

    print()
    print("=== data/processed/lunar/lunar_daily_2020_2040.csv 前 10 列 ===")
    with daily_path.open(encoding="utf-8") as fh:
        for i, line in zip(range(11), fh):
            print(line.rstrip("\n"))

    festival_header = "solar_year,lunar_year,festival,solar_date"
    for name in ("除夕", "清明", "冬至"):
        matched = [r for r in festival_rows if r["festival"] == name]
        print()
        print(f"=== 節日表:所有「{name}」({len(matched)} 筆) ===")
        print(festival_header)
        for r in matched:
            print(f"{r['solar_year']},{r['lunar_year']},{r['festival']},{r['solar_date']}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
