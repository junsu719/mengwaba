"""將 data/legacy-redirects/{city_key}.json 轉成 D1 匯入用 SQL(見 ../d1/migrations/003-legacy-point-redirects.sql)。

前提:pipeline/build_legacy_redirects.py 已執行過、data/legacy-redirects/*.json 已存在。
只產生 .sql 檔案,不呼叫 wrangler——實際套用由執行者另外用
`wrangler d1 execute mengwaba-trash-points [--local|--remote] --file=d1/import/legacy_redirects.sql`
(於 site/ 目錄下執行)套用,--remote 前需依 CLAUDE.md 鐵律 7/8 取得 Jun 同意並先在 --local 驗證。

見 pipeline/build_legacy_redirects.py 開頭說明:對照表只收「唯一可信賴配對」,查無對應或
同址多筆無法唯一判定的一律不收錄,查詢時查不到就是誠實 404,不是這支腳本的錯誤。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
LEGACY_DIR = ROOT / "data" / "legacy-redirects"
IMPORT_DIR = ROOT / "d1" / "import"

BATCH_SIZE = 200


def sql_str(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


def build_insert_statements(city_slug: str, rows: list[dict[str, str]]) -> list[str]:
    statements = []
    batch: list[str] = []

    def flush() -> None:
        if not batch:
            return
        cols = "(city_slug, district_slug, old_slug, new_point_id)"
        statements.append(f"INSERT INTO legacy_point_redirects {cols} VALUES\n" + ",\n".join(batch) + ";")
        batch.clear()

    for r in rows:
        row = "(" + ", ".join(
            [sql_str(city_slug), sql_str(r["district_slug"]), sql_str(r["old_slug"]), sql_str(r["new_point_id"])]
        ) + ")"
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            flush()
    flush()
    return statements


def main() -> None:
    city_keys = sys.argv[1:]
    if not city_keys:
        print("[push_legacy_redirects_d1] 用法: python pipeline/push_legacy_redirects_d1.py <city_key> [city_key ...]", file=sys.stderr)
        sys.exit(1)

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = IMPORT_DIR / "legacy_redirects.sql"

    lines: list[str] = []
    total = 0
    for city_key in city_keys:
        src_path = LEGACY_DIR / f"{city_key}.json"
        if not src_path.exists():
            print(f"[push_legacy_redirects_d1] 找不到 {src_path},請先跑 pipeline/build_legacy_redirects.py", file=sys.stderr)
            sys.exit(1)
        rows: list[dict[str, Any]] = json.loads(src_path.read_text(encoding="utf-8"))
        lines.append(f"DELETE FROM legacy_point_redirects WHERE city_slug = {sql_str(city_key)};")
        lines.extend(build_insert_statements(city_key, rows))
        total += len(rows)
        print(f"[push_legacy_redirects_d1] {city_key}: {len(rows)} 筆對照")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[push_legacy_redirects_d1] 共 {total} 筆,已寫入 {out_path}")


if __name__ == "__main__":
    main()
