"""高雄市清運班表 PDF 解析核心(kepbgps.kcg.gov.tw/download_schedule.aspx)。

背景見 DECISIONS.md 2026-07-21:原本高雄 CSV 資料源(data.kcg.gov.tw)整份很可能是資源回收車
路線,和一般垃圾車時刻混淆。改用高雄市環保局官方 PDF 班表,垃圾/回收分開標示,結構完整。
PDF 由 Jun 每季手動下載至 data/raw/kaohsiung-pdf/{行政區}.pdf,本模組不含任何抓取邏輯
(該站 robots.txt 禁止自動存取,手動下載屬正常使用,非本 pipeline 職責)。

PDF 排版有三個已知的來源端瑕疵,解析時都要處理:
1. 中文字用「同一字疊印兩次、水平偏移約 0.3pt」模擬粗體(數字/符號不受影響),文字擷取若
   不去重,每個中文字都會變成兩份緊鄰字元。
2. 少數列(三民區實測 12/1667 = 0.72%)剛好卡在 PDF 頁面斷點,表格列被切成殘缺片段(缺欄位
   或缺時段)。這類列一律嚴格用格式驗證篩掉、記錄丟棄原因,絕不用猜測拼接補上缺的欄位。
   （2026-07-21 拍板:未來若要做「跨頁邊界感知拼接」,必須是偵測第 N 頁末列與第 N+1 頁首列
   互為殘缺延續、拼接後仍要通過同一套格式驗證才採用,不通過就照樣丟棄——是確定性拼接,不是
   猜測;本次 Phase A/B 尚未實作,此為已知限制,留待之後處理。)
3. 除三民區、鳳山區外,其餘行政區的 PDF 背景都有一個旋轉的浮水印「高雄市政府環境保護局」,
   字級遠大於表格內文且變換矩陣帶有旋轉分量,會被 pdfplumber 依座標誤塞進疊到的表格儲存格,
   汙染儲存格文字(2026-07-21 發現,起因是仁武區等區丟棄率一度異常高達 30%+ 才追查出來)。
   dedupe_page() 用矩陣是否有旋轉分量精準濾掉,不影響表格本身的直式字元。

另外,桃源區的 PDF 多一欄「清運方式」(定點/沿街),其餘 35 區皆無此欄、隱含全部視為定點
清運(此假設已用三民區資料實測比對 Jun 的實地資料驗證無誤)。parse_district_pdf() 會依欄位數
(10 或 11)自動判斷是否有這一欄。
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any, TypedDict

import pdfplumber

TIME = r"[0-2]?\d:[0-5]\d"
_PAT_BOTH = re.compile(rf"^({TIME})~({TIME})\n\(({TIME})~({TIME})\)$")
_PAT_GARBAGE_ONLY = re.compile(rf"^({TIME})~({TIME})\n\(無清運\)$")
_PAT_NONE = re.compile(r"^無清運$")

WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]  # 欄位順序固定為週一~週日,對應 ISO weekday

# PDF 檔名(行政區全名)→ URL slug。沿用 normalize.py 既有 DISTRICT_MAP 的拼音慣例;
# 桃源區為新增(舊 CSV 資料源從未涵蓋,PDF 班表意外多補上一個行政區)。
DISTRICT_SLUGS: dict[str, str] = {
    "三民區": "sanmin",
    "仁武區": "renwu",
    "內門區": "neimen",
    "六龜區": "liugui",
    "前金區": "qianjin",
    "前鎮區": "qianzhen",
    "大寮區": "daliao",
    "大樹區": "dashu",
    "大社區": "dashe",
    "小港區": "xiaogang",
    "岡山區": "gangshan",
    "左營區": "zuoying",
    "彌陀區": "mituo",
    "新興區": "xinxing",
    "旗山區": "qishan",
    "旗津區": "cijin",
    "杉林區": "shanlin",
    "林園區": "linyuan",
    "桃源區": "taoyuan",
    "梓官區": "ziguan",
    "楠梓區": "nanzi",
    "橋頭區": "qiaotou",
    "永安區": "yongan",
    "湖內區": "hunei",
    "燕巢區": "yanchao",
    "田寮區": "tianliao",
    "甲仙區": "jiaxian",
    "美濃區": "meinong",
    "苓雅區": "lingya",
    "茄萣區": "qieding",
    "路竹區": "luzhu",
    "阿蓮區": "alian",
    "鳥松區": "niaosong",
    "鳳山區": "fengshan",
    "鹽埕區": "yancheng",
    "鼓山區": "gushan",
}

# 官方未提供班表的行政區(人口極少的原住民區),不得用鄰區資料替代或推測填補,見 2026-07-21 決策。
NO_SCHEDULE_DISTRICTS = ("那瑪夏區", "茂林區")


class ScheduleEntry(TypedDict):
    weekday: list[int]
    arrive: str
    depart: str


class ParsedRow(TypedDict):
    district: str
    district_slug: str
    village: str | None
    plate: str | None
    point_name: str
    collection_type: str
    schedule: list[ScheduleEntry]
    recycling_schedule: list[ScheduleEntry]
    first_arrive: str | None


# 桃源區「清運方式」欄位值 → collection_type,對齊 normalize.py TAICHUNG_COLLECTION_TYPE_MAP
# 的既有慣例(定點清運/沿街收運),讓兩縣市頁面呈現邏輯一致。
COLLECTION_TYPE_MAP = {
    "定點": "定點清運",
    "沿街": "沿街收運",
}


class DistrictParseReport(TypedDict):
    district: str
    total_rows: int
    valid_rows: int
    dropped_rows: int
    dropped_reasons: dict[str, int]
    download_date: str | None


def dedupe_page(page: "pdfplumber.page.Page") -> "pdfplumber.page.Page":
    """去除兩種排版瑕疵字元:

    1. 假粗體造成的重複字元(同文字、同 top、x0 相差 <1pt 視為同一個字)。
    2. 大部分行政區 PDF(三民區、鳳山區除外)背景有一個旋轉的浮水印「高雄市政府環境保護局」,
       字級遠大於表格內文(約 40pt vs 表格 7.2pt)且字元變換矩陣帶有非零的旋轉分量,
       會被 pdfplumber 依座標塞進剛好疊到的表格儲存格,汙染儲存格文字(2026-07-21 發現,
       起因是仁武區等區丟棄率異常高達 30%+ 才追查出來)。用變換矩陣是否為軸對齊
       (無旋轉分量)判斷,精準只濾掉浮水印,不影響表格本身的直式字元。
    """
    buckets: dict[float, list[dict[str, Any]]] = defaultdict(list)
    keep_ids: set[int] = set()
    for c in page.chars:
        matrix = c.get("matrix", (1, 0, 0, 1, 0, 0))
        if abs(matrix[1]) > 0.001 or abs(matrix[2]) > 0.001:
            continue  # 旋轉浮水印字元,直接濾掉

        key = round(c["top"], 1)
        dup = False
        for s in buckets[key]:
            if s["text"] == c["text"] and abs(s["x0"] - c["x0"]) < 1.0:
                dup = True
                break
        if not dup:
            buckets[key].append(c)
            keep_ids.add(id(c))
    return page.filter(lambda obj: obj.get("object_type") != "char" or id(obj) in keep_ids)


def _extract_download_date(page: "pdfplumber.page.Page") -> str | None:
    text = page.extract_text() or ""
    m = re.search(r"下載日期[：:]\s*(\d+年\d+月\d+日)", text)
    return m.group(1) if m else None


def _classify_cell(cell: str | None) -> tuple[str | None, str | None, str | None, str | None] | None:
    """回傳 (垃圾抵達, 垃圾離開, 回收抵達, 回收離開),任一缺席為 None;格式不合法回傳 None(整格)。"""
    cs = (cell or "").strip()
    m = _PAT_BOTH.match(cs)
    if m:
        return m.group(1), m.group(2), m.group(3), m.group(4)
    m = _PAT_GARBAGE_ONLY.match(cs)
    if m:
        return m.group(1), m.group(2), None, None
    if _PAT_NONE.match(cs):
        return None, None, None, None
    return None


def _group_schedule(day_times: dict[int, tuple[str, str]]) -> list[ScheduleEntry]:
    """把逐日 (weekday -> (arrive, depart)) 依相同時段合併成 schedule entries,依 weekday 排序。"""
    groups: dict[tuple[str, str], list[int]] = {}
    for wd, (arrive, depart) in day_times.items():
        groups.setdefault((arrive, depart), []).append(wd)
    entries = [
        {"weekday": sorted(days), "arrive": arrive, "depart": depart} for (arrive, depart), days in groups.items()
    ]
    entries.sort(key=lambda e: e["weekday"])
    return entries


def parse_district_pdf(pdf_path: Path) -> tuple[list[ParsedRow], DistrictParseReport]:
    district = pdf_path.stem
    slug = DISTRICT_SLUGS.get(district)
    if slug is None:
        raise ValueError(f"未知行政區檔名 {district!r},請確認 DISTRICT_SLUGS 是否需要補上對應 slug")

    total = 0
    dropped_reasons: dict[str, int] = defaultdict(int)
    rows: list[ParsedRow] = []
    download_date: str | None = None

    with pdfplumber.open(pdf_path) as pdf:
        for pi, page in enumerate(pdf.pages):
            p = dedupe_page(page)
            if pi == 0:
                download_date = _extract_download_date(p)
            tables = p.extract_tables()
            for table in tables:
                for raw_row in table:
                    first = (raw_row[0] or "").strip()
                    if not first or first == "里別":
                        continue
                    total += 1

                    # 標準格式 10 欄(無「清運方式」欄,隱含定點清運);桃源區 11 欄
                    # (第 4 欄為「清運方式」,定點/沿街)。其餘欄位數視為解析異常。
                    if len(raw_row) == 10:
                        collection_type_raw = None
                        weekday_start = 3
                    elif len(raw_row) == 11:
                        collection_type_raw = (raw_row[3] or "").strip()
                        weekday_start = 4
                    else:
                        dropped_reasons["wrong_col_count"] += 1
                        continue

                    village = first
                    plate = (raw_row[1] or "").strip() or None
                    point_name = (raw_row[2] or "").replace("\n", "").strip()

                    g_days: dict[int, tuple[str, str]] = {}
                    r_days: dict[int, tuple[str, str]] = {}
                    ok = True
                    for i, wd in enumerate(WEEKDAYS):
                        parsed = _classify_cell(raw_row[weekday_start + i])
                        if parsed is None:
                            ok = False
                            break
                        g_arrive, g_depart, r_arrive, r_depart = parsed
                        if g_arrive and g_depart:
                            g_days[wd] = (g_arrive, g_depart)
                        if r_arrive and r_depart:
                            r_days[wd] = (r_arrive, r_depart)
                    if not ok:
                        dropped_reasons["cell_pattern_fail"] += 1
                        continue

                    if not point_name:
                        dropped_reasons["empty_point_name"] += 1
                        continue

                    if collection_type_raw is not None:
                        collection_type = COLLECTION_TYPE_MAP.get(collection_type_raw)
                        if collection_type is None:
                            dropped_reasons["unknown_collection_type"] += 1
                            continue
                    else:
                        collection_type = "定點清運"

                    schedule = _group_schedule(g_days)
                    recycling_schedule = _group_schedule(r_days)
                    first_arrive = schedule[0]["arrive"] if schedule else None

                    rows.append(
                        {
                            "district": district,
                            "district_slug": slug,
                            "village": village or None,
                            "plate": plate,
                            "point_name": point_name,
                            "collection_type": collection_type,
                            "schedule": schedule,
                            "recycling_schedule": recycling_schedule,
                            "first_arrive": first_arrive,
                        }
                    )

    report: DistrictParseReport = {
        "district": district,
        "total_rows": total,
        "valid_rows": len(rows),
        "dropped_rows": total - len(rows),
        "dropped_reasons": dict(dropped_reasons),
        "download_date": download_date,
    }
    return rows, report
