#!/usr/bin/env python3
"""
神明生日國曆換算(純計算,不查外部資料)。

輸入:
  data/raw/deities/deity_birthdays.csv          (三源一致主表,24 尊神明,30 筆;
                                                  瑤池金母/王母娘娘已於 2026-09-19
                                                  查證確認為同一神明,合併為一筆)
  data/processed/lunar/lunar_daily_2020_2040.csv (已驗證的每日農曆對照)

輸出:
  data/processed/deities/deity_dates_2020_2040.csv  (每尊神明 × 每個紀念日 × 每年國曆對照)
  data/processed/deities/deity_by_lunar_month.csv   (農曆月份索引)

農曆三十日替代規則(2026-09-19 新增):當紀念日訂在農曆三十日、但該年該農曆月
只有 29 天時,不再視為「當年無對應日期」,改取該月廿九日,並在輸出標記
date_adjusted=true、adjust_note 說明原因。此規則僅適用於農曆三十日這個情況;
其他任何在 2020-2040 範圍內查無對應日期、且無法歸類為 type_year_boundary
(農曆年與國曆年邊界重疊,見下)的組合,一律視為未預期的異常,腳本會停止並回報,
不會靜默略過或自行決定如何處理。

自我檢查(內建,任一項 b/c/d/e2 不符則立即中止,不寫出任何檔案):
  a. 每尊神明的每個紀念日,2020-2040 每一年都恰好有一筆(三十日/廿九日替代規則
     視同一筆),除非該年已被記錄為 type_year_boundary 例外(可以是 0 筆或 2 筆
     以上)。任何不屬於這兩種情況的缺漏或重複,立即中止並回報。
     例外清單分兩種類型:
       type_29_30       農曆該月當年只有 29 天,已自動改用廿九日(不再是缺漏)
       type_year_boundary 農曆年與國曆年邊界重疊,同一國曆年出現兩次或零次
                          (目前僅見於農曆十二月的紀念日,例:2022 年釋迦牟尼佛
                          十二月初八出現兩筆,2023 年則無)
  b. 天上聖母 三月廿三 2026 年應為 2026-05-09
  c. 玉皇上帝 正月初九 2026 年應為 2026-02-25
  d. 關聖帝君 六月廿四 2026 年應為 2026-08-06
     (原預期值 2026-08-07 經查證為使用者提供的錯誤資料,來自存在整批位移一天
     問題的商業性神明生日對照文,2026-09-19 修正)
  e. 每個 solar_date 皆可在 lunar_daily 對照表中查到對應的農曆月日
  e2. 反向驗證:2026-08-07 的農曆應為六月廿五,非六月廿四,用於確認上述
      「整批位移一天」的問題不存在於本專案資料
  f. weekday 與 solar_date 相符
"""

import csv
import datetime
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEITY_CSV = ROOT / "data/raw/deities/deity_birthdays.csv"
LUNAR_CSV = ROOT / "data/processed/lunar/lunar_daily_2020_2040.csv"
OUT_DIR = ROOT / "data/processed/deities"
OUT_DATES = OUT_DIR / "deity_dates_2020_2040.csv"
OUT_MONTH_INDEX = OUT_DIR / "deity_by_lunar_month.csv"

YEARS = range(2020, 2041)
WEEKDAY_ZH = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def load_deities():
    with open(DEITY_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    occasions = []
    for r in rows:
        occasions.append(
            {
                "deity_name": r["deity_name"],
                "common_name": r["common_name"],
                "lunar_month": int(r["lunar_month"]),
                "lunar_day": int(r["lunar_day"]),
                "occasion_type": r["occasion_type"],
                "honorific_source": r["honorific_source"],
            }
        )
    return occasions


def load_lunar_index():
    """key=(month,day) -> list of (solar_date, lunar_year, month_label, day_label), 只含非閏月。"""
    index = defaultdict(list)
    all_rows_by_date = {}
    with open(LUNAR_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            all_rows_by_date[r["solar_date"]] = r
            if r["is_leap_month"] == "false":
                key = (int(r["lunar_month"]), int(r["lunar_day"]))
                index[key].append(
                    {
                        "solar_date": r["solar_date"],
                        "lunar_year": r["lunar_year"],
                        "lunar_month_label": r["lunar_month_label"],
                        "lunar_day_label": r["lunar_day_label"],
                    }
                )
    return index, all_rows_by_date


def weekday_zh(solar_date: str) -> str:
    d = datetime.date.fromisoformat(solar_date)
    return WEEKDAY_ZH[d.weekday()]


def find_prev_next(month: int, day: int, year: int, index):
    """在整份 lunar_daily 範圍內(不限 2020-2040),找出該農曆月日在指定國曆年之前
    最近一次、之後最近一次的國曆日期,供 type_year_boundary 例外說明使用。"""
    all_matches = index.get((month, day), [])
    prev_date = None
    next_date = None
    for m in all_matches:
        y = int(m["solar_date"][:4])
        if y < year:
            prev_date = m["solar_date"]
        elif y > year and next_date is None:
            next_date = m["solar_date"]
    return prev_date, next_date


def main():
    occasions = load_deities()
    index, all_rows_by_date = load_lunar_index()

    print("=" * 60)
    print("自我檢查")
    print("=" * 60)

    checks_passed = True

    def find(month, day, year):
        matches = [e for e in index.get((month, day), []) if e["solar_date"][:4] == str(year)]
        return matches

    # b/c/d 硬性抽驗
    # d 的預期值原為 2026-08-07,經人工查證為使用者提供的錯誤資料(來自商業性神明
    # 生日對照文,該類來源存在整批位移一天的問題),已於 2026-09-19 修正為 2026-08-06。
    spot_checks = [
        ("b", "天上聖母", 3, 23, 2026, "2026-05-09"),
        ("c", "玉皇上帝", 1, 9, 2026, "2026-02-25"),
        ("d", "關聖帝君", 6, 24, 2026, "2026-08-06"),
    ]
    for label, name, month, day, year, expected in spot_checks:
        matches = find(month, day, year)
        actual = matches[0]["solar_date"] if matches else "(查無對應日期)"
        status = "OK" if actual == expected else "FAIL"
        if status == "FAIL":
            checks_passed = False
        print(f"[{label}] {name} {month}/{day} {year}年 -> 預期 {expected},實際 {actual} [{status}]")

    # e2: 反向驗證,確認前述「整批位移一天」的問題不存在於本專案資料——
    # 2026-08-07 這天的農曆應為六月廿五,不是六月廿四(6/7 常被錯誤商業來源寫成 6/24)。
    reverse_row = all_rows_by_date.get("2026-08-07")
    reverse_actual = f"{reverse_row['lunar_month']}/{reverse_row['lunar_day']}" if reverse_row else "(查無資料)"
    reverse_expected = "6/25"
    reverse_status = "OK" if reverse_actual == reverse_expected else "FAIL"
    if reverse_status == "FAIL":
        checks_passed = False
    print(f"[e2] 2026-08-07 的農曆 -> 預期 {reverse_expected},實際 {reverse_actual} [{reverse_status}]")

    if not checks_passed:
        print()
        print("!" * 60)
        print("b/c/d 抽驗至少一項不符,依指示立即停止,不寫出任何檔案。")
        print("!" * 60)
        sys.exit(1)

    # --- 通過抽驗才繼續產生資料 ---
    # 農曆年與國曆年邊界重疊的現象(同一國曆年出現兩次或零次)物理上只可能發生在
    # 貼近農曆年尾的月份(十、十一、十二月);若十月以前的月份出現零筆或多筆,
    # 代表出現未知的異常組合,不屬於已知規則,直接停止回報。
    BOUNDARY_MONTHS = {10, 11, 12}

    date_rows = []
    exceptions = []  # type_29_30 / type_year_boundary

    for occ in occasions:
        month, day = occ["lunar_month"], occ["lunar_day"]
        year_row_count = {}
        boundary_years_for_occ = set()

        for year in YEARS:
            matches = find(month, day, year)
            adjusted = False
            adjust_note = ""

            # 農曆三十日替代規則:當年該月只有 29 天時,改用廿九日
            if len(matches) == 0 and day == 30:
                fallback = find(month, 29, year)
                if fallback:
                    matches = fallback
                    adjusted = True
                    adjust_note = f"{year} 年農曆{month}月僅 29 日,以{month}月廿九為準"
                    exceptions.append(
                        {
                            "type": "type_29_30",
                            "deity_name": occ["deity_name"],
                            "common_name": occ["common_name"],
                            "lunar_month": month,
                            "lunar_day": day,
                            "year": year,
                            "reason": f"{year} 年農曆{month}月僅 29 天,已自動調整為使用{month}月廿九日",
                        }
                    )
                else:
                    print(
                        f"[異常] {occ['deity_name']} {month}/{day} 在 {year} 年"
                        f"既無三十日也無廿九日對應,超出已知規則,需人工檢視"
                    )
                    sys.exit(1)

            if len(matches) == 0:
                if month in BOUNDARY_MONTHS:
                    prev_date, next_date = find_prev_next(month, day, year, index)
                    exceptions.append(
                        {
                            "type": "type_year_boundary",
                            "deity_name": occ["deity_name"],
                            "common_name": occ["common_name"],
                            "lunar_month": month,
                            "lunar_day": day,
                            "year": year,
                            "reason": (
                                f"{year} 年無對應日期(農曆年與國曆年邊界重疊);"
                                f"前一次 {prev_date or '(資料範圍外)'},"
                                f"後一次 {next_date or '(資料範圍外)'}"
                            ),
                        }
                    )
                    boundary_years_for_occ.add(year)
                    year_row_count[year] = 0
                    continue
                else:
                    print(
                        f"[a][異常] {occ['deity_name']} {month}/{day} 在 {year} 年查無對應日期,"
                        f"且不屬於三十日替代規則、月份也不在十至十二月範圍,"
                        f"不屬於已知的農曆年邊界重疊模式,需人工檢視"
                    )
                    sys.exit(1)

            if len(matches) > 1:
                if month in BOUNDARY_MONTHS:
                    exceptions.append(
                        {
                            "type": "type_year_boundary",
                            "deity_name": occ["deity_name"],
                            "common_name": occ["common_name"],
                            "lunar_month": month,
                            "lunar_day": day,
                            "year": year,
                            "reason": (
                                f"{year} 年出現 {len(matches)} 筆對應日期(農曆年與國曆年邊界重疊):"
                                f"{[m['solar_date'] for m in matches]}"
                            ),
                        }
                    )
                    boundary_years_for_occ.add(year)
                else:
                    print(
                        f"[a][異常] {occ['deity_name']} {month}/{day} 在 {year} 年出現 "
                        f"{len(matches)} 筆對應日期,月份不在十至十二月範圍,不屬於已知的農曆年邊界"
                        f"重疊模式,需人工檢視"
                    )
                    sys.exit(1)

            year_row_count[year] = len(matches)

            for m in matches:
                solar_date = m["solar_date"]
                lunar_row = all_rows_by_date[solar_date]
                # e: solar_date 對照表農曆月日須與本表一致(替代規則下比對廿九日)
                actual_day = 29 if adjusted else day
                assert int(lunar_row["lunar_month"]) == month
                assert int(lunar_row["lunar_day"]) == actual_day
                wd = weekday_zh(solar_date)
                date_rows.append(
                    {
                        "solar_year": int(solar_date[:4]),
                        "solar_date": solar_date,
                        "weekday": wd,
                        "deity_name": occ["deity_name"],
                        "common_name": occ["common_name"],
                        "lunar_month": month,
                        "lunar_day": day,
                        "lunar_label": m["lunar_month_label"] + m["lunar_day_label"],
                        "occasion_type": occ["occasion_type"],
                        "honorific_source": occ["honorific_source"],
                        "date_adjusted": "true" if adjusted else "false",
                        "adjust_note": adjust_note,
                    }
                )

        # a: 每一年都應恰好一筆,除非該年已被記錄為 type_year_boundary(可以是 0 或 2+ 筆)
        for year in YEARS:
            cnt = year_row_count.get(year, 0)
            if year in boundary_years_for_occ:
                continue
            if cnt != 1:
                print(
                    f"[a][異常] {occ['deity_name']} {month}/{day} 在 {year} 年寫入 {cnt} 筆,"
                    f"非預期的 1 筆,且未列入 type_year_boundary 例外,需人工檢視"
                )
                sys.exit(1)

    print(f"[a] 每尊神明每個紀念日 2020-2040 各年皆恰有一筆(三十日替代規則視同一筆),"
          f"僅 type_year_boundary 例外年份可為 0 或 2 筆以上:OK"
          f"({len(exceptions)} 筆列入例外清單,詳見下方)")

    # f: weekday 複查(用另一條路徑重算一次比對)
    f_ok = True
    for row in date_rows:
        d = datetime.date.fromisoformat(row["solar_date"])
        expected_wd = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][d.weekday()]
        if expected_wd != row["weekday"]:
            f_ok = False
    print(f"[f] weekday 與 solar_date 相符:{'OK' if f_ok else 'FAIL'}")
    print(f"[e] solar_date 於 lunar_daily 皆可查得且農曆月日一致:OK(產生過程已用 assert 保證)")

    if not f_ok:
        print()
        print("!" * 60)
        print("自我檢查發現異常,停止寫出檔案,請人工檢視上方訊息。")
        print("!" * 60)
        sys.exit(1)

    # --- 寫出產出一 ---
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    date_rows.sort(key=lambda r: (r["deity_name"], r["lunar_month"], r["lunar_day"], r["solar_year"]))
    fieldnames1 = [
        "solar_year",
        "solar_date",
        "weekday",
        "deity_name",
        "common_name",
        "lunar_month",
        "lunar_day",
        "lunar_label",
        "occasion_type",
        "honorific_source",
        "date_adjusted",
        "adjust_note",
    ]
    with open(OUT_DATES, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames1)
        writer.writeheader()
        writer.writerows(date_rows)

    # --- 產出二:月份索引(每尊神明每個紀念日一筆,不逐年展開) ---
    month_index_rows = []
    seen = set()
    for occ in occasions:
        key = (occ["deity_name"], occ["lunar_month"], occ["lunar_day"])
        if key in seen:
            continue
        seen.add(key)
        # 取任一年份的 label 即可(同一農曆月日 label 不隨年份改變)
        sample = index.get((occ["lunar_month"], occ["lunar_day"]))
        label = (sample[0]["lunar_month_label"] + sample[0]["lunar_day_label"]) if sample else ""
        month_index_rows.append(
            {
                "lunar_month": occ["lunar_month"],
                "lunar_day": occ["lunar_day"],
                "lunar_label": label,
                "deity_name": occ["deity_name"],
                "common_name": occ["common_name"],
                "occasion_type": occ["occasion_type"],
            }
        )
    month_index_rows.sort(key=lambda r: (r["lunar_month"], r["lunar_day"]))
    fieldnames2 = ["lunar_month", "lunar_day", "lunar_label", "deity_name", "common_name", "occasion_type"]
    with open(OUT_MONTH_INDEX, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames2)
        writer.writeheader()
        writer.writerows(month_index_rows)

    print()
    print(f"寫出 {OUT_DATES} ({len(date_rows)} 筆)")
    print(f"寫出 {OUT_MONTH_INDEX} ({len(month_index_rows)} 筆)")

    print()
    print("=" * 60)
    print("例外清單")
    print("=" * 60)
    type_29_30 = [e for e in exceptions if e["type"] == "type_29_30"]
    type_boundary = [e for e in exceptions if e["type"] == "type_year_boundary"]

    print(f"-- type_29_30(農曆該月當年僅 29 天,已自動調整為廿九日)共 {len(type_29_30)} 筆 --")
    if type_29_30:
        for e in type_29_30:
            print(f"  {e['deity_name']}({e['common_name']}) {e['lunar_month']}/{e['lunar_day']} "
                  f"{e['year']} 年:{e['reason']}")
    else:
        print("  (無)")

    print(f"-- type_year_boundary(農曆年與國曆年邊界重疊,同年出現 0 筆或 2 筆以上)共 {len(type_boundary)} 筆 --")
    if type_boundary:
        for e in type_boundary:
            print(f"  {e['deity_name']}({e['common_name']}) {e['lunar_month']}/{e['lunar_day']} "
                  f"{e['year']} 年:{e['reason']}")
    else:
        print("  (無)")

    print()
    print("=" * 60)
    print("2026 年全年神明生日清單(依國曆日期排序)")
    print("=" * 60)
    rows_2026 = sorted(
        (r for r in date_rows if r["solar_year"] == 2026),
        key=lambda r: r["solar_date"],
    )
    for r in rows_2026:
        print(
            f"{r['solar_date']} ({r['weekday']}) {r['deity_name']}"
            f"{'(' + r['common_name'] + ')' if r['common_name'] else ''} "
            f"農曆{r['lunar_label']} {r['occasion_type']}"
        )


if __name__ == "__main__":
    main()
