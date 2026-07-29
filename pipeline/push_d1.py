"""將 data/normalized/{city_key}.json 轉成 D1 匯入用 SQL(見 ../d1/schema.sql)。高雄市、臺中市。

前提:僅可在對應 city_key 的 validate.py 已通過(exit code 0)後執行,鐵律「驗證失敗絕不推送 D1」不變
(見 ../CLAUDE.md 鐵律 1、../DECISIONS.md 2026-07-17)。本腳本本身不重跑驗證,依賴既有 pipeline 順序
(fetch → normalize → validate → push_d1)由執行者手動依序跑,與 fetch.py/normalize.py/validate.py 的既有慣例一致。

只產生 .sql 檔案,不呼叫 wrangler——實際寫入本機/遠端 D1 由執行者另外用
`wrangler d1 execute mengwaba-trash-points [--local|--remote] --file=d1/import/<city_key>.sql`
(於 site/ 目錄下執行,因 D1 binding 設定在 site/wrangler.jsonc)套用,兩步驟分開以便套用前可先檢查 SQL 內容。

匯入範圍:只匯入「publishable」子集(district && point_name && (schedule、recycling_schedule、
foodscraps_schedule 三者至少一個非空)),與 site/src/lib/data-static.ts 的 loadCityPoints() 靜態 build 過濾邏輯一致,
確保 D1 on-demand 查詢回傳的頁面集合與現行靜態頁面集合完全相同。被濾除的筆數逐縣市記錄於報告,
不靜默丟棄(2026-07-17 拍板)。

I1(2026-07-27 拍板):原本只要求 schedule 非空,會把「純資源回收點」(schedule=[] 但
recycling_schedule 有值,如桃園 lagi2-002_C_5/C_6 兩條純回收路線共 98 點)排除在外——但
normalize.py 當初特地做 car_type 聯集就是為了不讓這批點被路線篩選誤刪,結果在這裡被同一種
邏輯抵消。這批點有真實服務(回收班表、里別、座標齊全),改為只有 schedule 與 recycling_schedule
「兩者皆空」才排除;頁面層(site/src/lib/content.ts)已改為對 schedule 為空但 recycling_schedule
非空的點,顯示「僅提供資源回收收運」的措辭,不再誤植一般垃圾清運文案。

每次匯入以「單一縣市」為更新單位:SQL 內容為 `DELETE FROM points WHERE city_slug = ?` 後接
INSERT 陣列,套用時不影響其他縣市既有列(見 d1/schema.sql 開頭註解的 DROP TABLE 陷阱說明)。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
NORMALIZED_DIR = ROOT / "data" / "normalized"
IMPORT_DIR = ROOT / "d1" / "import"

BATCH_SIZE = 50

COLUMNS = (
    "point_id", "city", "city_slug", "district", "district_slug", "village",
    "point_name", "address", "lat", "lng", "schedule", "recycling_schedule",
    "foodscraps_schedule", "collection_type", "notes", "source", "fetched_at",
)


def parse_district_slug(point_id: str) -> str:
    """依 "-" 結構切分取第二段(行政區),不對序號字元集做假設——與
    site/src/lib/data.ts 的 parsePointId() 同一套邏輯,兩邊需保持一致(見 DECISIONS.md 2026-07-22:
    原本 \\d+ 正規表示式是為舊序號寫的,雜湊 point_id 出現字母就會解析失敗)。
    這裡維持 raise 而非回傳 None:匯入 D1 前若有解析不出的 point_id,代表上游產生資料的邏輯本身
    有問題,依鐵律「不靜默丟棄」應該讓 push_d1 直接失敗、由執行者查明,而不是靜默略過某些列。
    """
    parts = point_id.split("-")
    if len(parts) < 3 or not parts[1] or any(not p for p in parts[2:]):
        raise ValueError(f"無法解析 point_id: {point_id!r}")
    return parts[1].lower()


def classify(record: dict[str, Any]) -> str | None:
    """回傳過濾原因(publishable 則回傳 None),對應 site/src/lib/data.ts 的 loadCityPoints 過濾邏輯。"""
    if not record.get("district"):
        return "missing_district"
    if not record.get("point_name"):
        return "missing_point_name"
    if (
        not record.get("schedule")
        and not record.get("recycling_schedule")
        and not record.get("foodscraps_schedule")
    ):
        return "empty_schedule_and_recycling"
    return None


def sql_str(v: Any) -> str:
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v: Any) -> str:
    return "NULL" if v is None else str(v)


def sql_json(v: Any) -> str:
    if not v:
        return "NULL"
    return sql_str(json.dumps(v, ensure_ascii=False))


def sql_json_array(v: Any) -> str:
    """給 schema 裡宣告 NOT NULL 的 schedule 欄位用:空陣列(純資源回收點,I1)一律序列化成
    JSON 字串 '[]',不能像 sql_json() 一樣把 falsy 值收斂成 SQL NULL,否則違反 NOT NULL 限制。
    site/src/lib/data-d1.ts 的 rowToPoint() 對這個欄位一律直接 JSON.parse,不判斷 null。"""
    return sql_str(json.dumps(v or [], ensure_ascii=False))


def sanitize_schedule_entries(entries: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    """D1 寫入前的最後一道保證(見 DECISIONS.md F1/F2 第 9 點:「保證在 pipeline 寫入端做,不指望
    消費端每處防禦」)。兩件事:①`weekday` 一律確保是陣列——不論上游 normalize.py 給的是 `None`、
    JSON `null`,還是漏掉這個 key,一律視為 `[]`(見 site/src/lib/data.ts ScheduleEntry.weekday 註解:
    空陣列代表「星期未知」,這裡不留任何把 null 這種型別以外的值傳給消費端的空間,WeekdayBadge/
    todayScheduleEntry 等處才不需要各自再防一次 null);②`weekday_source` 只是 validate.py 稽核用的
    資料來源標記(見 pipeline/validate.py check_l2_reasonableness 註解),只留在 data/normalized/*.json,
    不需要跟著進 D1、也不是任何頁面消費端需要的欄位,一併拿掉。"""
    if not entries:
        return entries
    sanitized = []
    for entry in entries:
        clean = {k: v for k, v in entry.items() if k != "weekday_source"}
        clean["weekday"] = clean.get("weekday") or []
        sanitized.append(clean)
    return sanitized


def build_insert_statements(records: list[dict[str, Any]]) -> list[str]:
    statements = []
    batch: list[str] = []

    def flush() -> None:
        if not batch:
            return
        cols = "(" + ", ".join(COLUMNS) + ")"
        statements.append(f"INSERT INTO points {cols} VALUES\n" + ",\n".join(batch) + ";")
        batch.clear()

    for r in records:
        district_slug = parse_district_slug(r["point_id"])
        row = "(" + ", ".join([
            sql_str(r["point_id"]),
            sql_str(r["city"]),
            sql_str(r["_city_slug"]),
            sql_str(r["district"]),
            sql_str(district_slug),
            sql_str(r.get("village")),
            sql_str(r["point_name"]),
            sql_str(r.get("address")),
            sql_num(r.get("lat")),
            sql_num(r.get("lng")),
            sql_json_array(sanitize_schedule_entries(r["schedule"])),
            sql_json(sanitize_schedule_entries(r.get("recycling_schedule"))),
            sql_json(sanitize_schedule_entries(r.get("foodscraps_schedule"))),
            sql_str(r["collection_type"]),
            sql_str(r.get("notes")),
            sql_str(r["source"]),
            sql_str(r["fetched_at"]),
        ]) + ")"
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            flush()
    flush()
    return statements


def push_city(city_key: str) -> dict[str, Any]:
    src_path = NORMALIZED_DIR / f"{city_key}.json"
    if not src_path.exists():
        print(f"[push_d1] 找不到正規化資料 {src_path},請先跑完 fetch → normalize → validate", file=sys.stderr)
        sys.exit(1)

    records: list[dict[str, Any]] = json.loads(src_path.read_text(encoding="utf-8"))

    reasons: dict[str, int] = {}
    publishable: list[dict[str, Any]] = []
    for r in records:
        reason = classify(r)
        if reason is None:
            r = {**r, "_city_slug": city_key}
            publishable.append(r)
        else:
            reasons[reason] = reasons.get(reason, 0) + 1

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = IMPORT_DIR / f"{city_key}.sql"

    lines = [f"DELETE FROM points WHERE city_slug = {sql_str(city_key)};"]
    lines.extend(build_insert_statements(publishable))
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = {
        "city_key": city_key,
        "total": len(records),
        "publishable": len(publishable),
        "filtered_out": len(records) - len(publishable),
        "filtered_reasons": reasons,
        "sql_file": str(out_path.relative_to(ROOT)),
    }
    return report


def main() -> None:
    city_keys = sys.argv[1:]
    if not city_keys:
        print("[push_d1] 用法: python pipeline/push_d1.py <city_key> [city_key ...]", file=sys.stderr)
        sys.exit(1)

    reports = [push_city(city_key) for city_key in city_keys]
    print(json.dumps({"reports": reports}, ensure_ascii=False, indent=2))

    for r in reports:
        if r["filtered_out"] > 0:
            print(
                f"[push_d1] {r['city_key']}: 濾除 {r['filtered_out']} 筆(原因: {r['filtered_reasons']}),"
                f"匯入 {r['publishable']}/{r['total']} 筆 → {r['sql_file']}",
                file=sys.stderr,
            )
        else:
            print(f"[push_d1] {r['city_key']}: 全部 {r['total']} 筆皆可發佈 → {r['sql_file']}", file=sys.stderr)

    print(
        "[push_d1] SQL 已產生,尚未套用。本地驗證請執行(於 site/ 目錄下):\n"
        + "\n".join(
            f"  npx wrangler d1 execute mengwaba-trash-points --local --file=../{r['sql_file']}"
            for r in reports
        ),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
