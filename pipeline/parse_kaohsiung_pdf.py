"""高雄市清運班表 PDF 批次解析 → data/normalized/kaohsiung.json。

取代舊有的 fetch.py(CSV)→ normalize.py(kaohsiung)路徑,原因見 DECISIONS.md 2026-07-21:
舊 CSV 資料源整份很可能是資源回收車路線,和一般垃圾車時刻混淆,已改用官方 PDF 班表
(data/raw/kaohsiung-pdf/{行政區}.pdf,由 Jun 每季手動下載,見 pipeline/kaohsiung_pdf.py 開頭
說明)。point_id 採內容雜湊 + 對照表(pipeline/point_id.py),data/id-map/kaohsiung.json
需 git 追蹤以保跨季 URL 穩定。

用法:python pipeline/parse_kaohsiung_pdf.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.kaohsiung_pdf import (  # noqa: E402
    NO_SCHEDULE_DISTRICTS,
    ParsedRow,
    parse_district_pdf,
)
from pipeline.point_id import assign_point_ids  # noqa: E402

PDF_DIR = ROOT / "data" / "raw" / "kaohsiung-pdf"
NORMALIZED_DIR = ROOT / "data" / "normalized"
SOURCE_URL = "https://kepbgps.kcg.gov.tw/download_schedule.aspx"
CITY = "高雄市"


def _roc_date_to_iso(roc_date: str | None) -> str | None:
    """把 PDF 內文的『115年07月21日』轉成 ISO 日期字串;解析失敗回傳 None。"""
    if not roc_date:
        return None
    import re

    m = re.match(r"(\d+)年(\d+)月(\d+)日", roc_date)
    if not m:
        return None
    roc_year, month, day = (int(x) for x in m.groups())
    return f"{roc_year + 1911:04d}-{month:02d}-{day:02d}"


def main() -> None:
    if not PDF_DIR.exists():
        print(f"[parse_kaohsiung_pdf] 找不到 {PDF_DIR},請先將 PDF 放入該目錄", file=sys.stderr)
        sys.exit(1)

    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[parse_kaohsiung_pdf] {PDF_DIR} 底下沒有 PDF 檔案", file=sys.stderr)
        sys.exit(1)

    all_rows: list[ParsedRow] = []
    reports = []
    download_dates: set[str] = set()
    fetched_at_by_district: dict[str, str] = {}

    for pdf_path in pdf_files:
        rows, report = parse_district_pdf(pdf_path)
        all_rows.extend(rows)
        reports.append(report)
        if report["download_date"]:
            download_dates.add(report["download_date"])
        # 各區 PDF 下載日期不一定相同(見下方警告),fetched_at 需逐區記錄,
        # 不可用單一全域日期蓋掉——2026-07-21 修正:先前誤用全域最早日期,
        # 會讓 35 個當季下載的區都被貼上桃源區那份 17 個月前的舊日期,誤導資料新鮮度判斷。
        district_date_iso = _roc_date_to_iso(report["download_date"])
        fetched_at_by_district[report["district"]] = (
            f"{district_date_iso}T00:00:00+08:00" if district_date_iso else datetime.now(timezone.utc).astimezone().isoformat()
        )
        print(
            f"[parse_kaohsiung_pdf] {report['district']}: "
            f"{report['valid_rows']}/{report['total_rows']} 筆可用"
            + (f",丟棄 {report['dropped_rows']} 筆 {report['dropped_reasons']}" if report["dropped_rows"] else ""),
            file=sys.stderr,
        )

    # 內容雜湊 point_id 需要 first_arrive/plate/village/point_name/district_slug 欄位,
    # ParsedRow 本身欄位已相容 IdentityRow 的必要子集。
    identity_rows = [
        {
            "district_slug": r["district_slug"],
            "village": r["village"],
            "point_name": r["point_name"],
            "plate": r["plate"],
            "first_arrive": r["first_arrive"],
        }
        for r in all_rows
    ]
    point_ids = assign_point_ids("kaohsiung", "KHH", identity_rows)  # type: ignore[arg-type]

    if len(download_dates) > 1:
        print(f"[parse_kaohsiung_pdf] 警告:各區 PDF 下載日期不一致 {sorted(download_dates)}", file=sys.stderr)

    normalized = []
    for row, point_id in zip(all_rows, point_ids):
        notes_parts = []
        if row["plate"]:
            notes_parts.append(f"車牌{row['plate']}")
        normalized.append(
            {
                "point_id": point_id,
                "city": CITY,
                "district": row["district"],
                "village": row["village"],
                "point_name": row["point_name"],
                "address": f"{CITY}{row['district']}{row['point_name']}",
                "lat": None,
                "lng": None,
                "schedule": row["schedule"],
                "recycling_schedule": row["recycling_schedule"],
                "collection_type": row["collection_type"],
                "notes": "、".join(notes_parts) or None,
                "source": SOURCE_URL,
                "fetched_at": fetched_at_by_district[row["district"]],
            }
        )

    NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = NORMALIZED_DIR / "kaohsiung.json"
    out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")

    report_path = PDF_DIR / "parse-report.json"
    covered_districts = {r["district"] for r in reports}
    missing = [d for d in NO_SCHEDULE_DISTRICTS if d not in covered_districts]
    summary = {
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "total_districts": len(reports),
        "total_valid_rows": sum(r["valid_rows"] for r in reports),
        "total_dropped_rows": sum(r["dropped_rows"] for r in reports),
        "no_schedule_districts_confirmed_absent": missing,
        "districts": reports,
    }
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[parse_kaohsiung_pdf] 完成:{len(normalized)} 筆 → {out_path}", file=sys.stderr)
    print(f"[parse_kaohsiung_pdf] 解析報告 → {report_path}", file=sys.stderr)
    print(f"[parse_kaohsiung_pdf] 確認無班表(不得用鄰區資料替代): {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
