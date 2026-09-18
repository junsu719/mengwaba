"""獨立驗證腳本:lunar_python 閏月判定是否可信(2020-2040)。

背景:節氣關卡已驗過(72 筆對 67 筆完全相符,5 筆差 1 分鐘為秒數四捨五入門檻造成,
非演算法差異)。閏月是本專案唯一會出大錯的地方,沒過這關不往下做行事曆閏月功能。

標準答案(中央氣象署民國 114 年日曆資料表):
  西曆 2025 年,農曆歲次乙巳年,閏六月,全年計 384 日
  對照:民國 115 年丙午年 354 日、民國 116 年丁未年 354 日,皆無閏月

不寫入 data/、不碰 pipeline/parse_calendar.py,純驗證、印報告用。

API 說明(lunar_python 1.4.8,實測查證,未憑印象猜測):
- LunarYear.fromYear(y).getLeapMonth():回傳該「農曆年」(以正月初一起算的民間慣用農曆年,
  年份 y 對齊該年正月初一所在的西元年,如 2025 年正月初一在西元 2025-01-29,對應乙巳年)
  的閏月月序,0 表示無閏月。此 API 與 LunarYear.getMonths()（以冬至/歲首為界的八字用
  「歲」概念,月份列表會跨到前一年 11 月起算)是不同的年份邊界定義,因此本腳本改用
  LunarMonth.fromYm(y, 1) 起、以 .next(1) 走訪到下一年 month=1 為止,自行圈出
  「正月初一到隔年正月初一前一日」的民用農曆年範圍,取代 getMonths()。
- LunarMonth 物件:getMonth() 正數為平月、負數（如 -6）為該月序的閏月;isLeap() 判定;
  getDayCount() 該月天數;getFirstJulianDay() 該月初一儒略日,經 Solar.fromJulianDay()
  轉換為國曆日期。
"""

from __future__ import annotations

from dataclasses import dataclass

from lunar_python import Lunar, LunarMonth, LunarYear, Solar


@dataclass
class MonthInfo:
    year: int
    month: int  # 正數平月,負數表示該數字月份的閏月
    is_leap: bool
    day_count: int
    first_solar: Solar

    @property
    def last_solar(self) -> Solar:
        return Solar.fromJulianDay(self.first_solar.getJulianDay() + self.day_count - 1)


def civil_lunar_year_months(year: int) -> list[MonthInfo]:
    """回傳農曆「year」年(正月初一所在西元年)正月初一到隔年正月初一前一日涵蓋的所有月份。"""
    months: list[MonthInfo] = []
    lm = LunarMonth.fromYm(year, 1)
    while True:
        info = MonthInfo(
            year=lm.getYear(),
            month=lm.getMonth(),
            is_leap=lm.isLeap(),
            day_count=lm.getDayCount(),
            first_solar=Solar.fromJulianDay(lm.getFirstJulianDay()),
        )
        months.append(info)
        nxt = lm.next(1)
        if nxt.getYear() == year + 1 and nxt.getMonth() == 1 and not nxt.isLeap():
            break
        lm = nxt
    return months


def year_ganzhi(year: int) -> str:
    return Lunar.fromYmd(year, 1, 1).getYearInGanZhi()


def year_summary(year: int) -> tuple[str, int, int, list[MonthInfo]]:
    """回傳 (干支, 閏月月序(0=無), 全年總天數, 月份清單)。"""
    months = civil_lunar_year_months(year)
    total_days = sum(m.day_count for m in months)
    leap_months = [m for m in months if m.is_leap]
    leap_month_num = abs(leap_months[0].month) if leap_months else 0
    return year_ganzhi(year), leap_month_num, total_days, months


def fmt_solar(s: Solar) -> str:
    return s.toString()


def main() -> int:
    ok = True
    lines: list[str] = []

    def check(label: str, actual, expected) -> None:
        nonlocal ok
        passed = actual == expected
        ok = ok and passed
        mark = "PASS" if passed else "FAIL"
        lines.append(f"[{mark}] {label}:實際={actual!r} 預期={expected!r}")

    lines.append("=== 驗證項目 1-3:2025 年(乙巳年)===")
    ganzhi_2025, leap_month_2025, total_2025, months_2025 = year_summary(2025)
    check("2025 農曆年干支", ganzhi_2025, "乙巳")

    # 項目 1:是否判定有閏月,且閏月為六月
    lunar_year_2025 = LunarYear.fromYear(2025)
    check("LunarYear.getLeapMonth()(交叉核對)", lunar_year_2025.getLeapMonth(), 6)
    check("自行月份走訪判定閏月月序", leap_month_2025, 6)

    # 項目 2:閏六月初一、最後一日對應國曆日期
    leap_month_info = next(m for m in months_2025 if m.is_leap)
    leap_start = fmt_solar(leap_month_info.first_solar)
    leap_end = fmt_solar(leap_month_info.last_solar)
    lines.append(f"     閏六月初一國曆日期:{leap_start}")
    lines.append(f"     閏六月最後一日國曆日期:{leap_end}(共 {leap_month_info.day_count} 天)")

    # 項目 3:乙巳年全年總天數
    check("2025 乙巳年全年總天數", total_2025, 384)

    lines.append("")
    lines.append("=== 驗證項目 4:對照組 2026 丙午年、2027 丁未年 ===")
    for year, expected_ganzhi in [(2026, "丙午"), (2027, "丁未")]:
        ganzhi, leap_month_num, total_days, _ = year_summary(year)
        check(f"{year} 農曆年干支", ganzhi, expected_ganzhi)
        check(f"{year} {expected_ganzhi}年 是否無閏月(0=無)", leap_month_num, 0)
        check(f"{year} {expected_ganzhi}年 全年總天數", total_days, 354)

    print("\n".join(lines))
    print()
    print("=" * 60)
    if ok:
        print("過關:第 1、2、3、4 項全部符合標準答案。")
    else:
        print("未過關:上方標記 [FAIL] 的項目與標準答案不符,已停止,未自行修正。")
    print("=" * 60)

    print()
    print("=== 額外產出:2020-2040 年含閏月的農曆年份清單(供人工複核)===")
    header = f"{'農曆年(西元)':<10}{'干支':<6}{'閏第幾月':<10}{'該年總天數':<10}{'閏月起始(國曆)':<16}{'閏月結束(國曆)':<16}"
    print(header)
    print("-" * len(header))
    for year in range(2020, 2041):
        ganzhi, leap_month_num, total_days, months = year_summary(year)
        if leap_month_num == 0:
            continue
        leap_info = next(m for m in months if m.is_leap)
        print(
            f"{year:<10}{ganzhi:<6}{'閏' + str(leap_month_num) + '月':<10}"
            f"{total_days:<10}{fmt_solar(leap_info.first_solar):<16}{fmt_solar(leap_info.last_solar):<16}"
        )

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
