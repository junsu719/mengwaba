#!/usr/bin/env python3
"""Phase 4.5 PoC only: 從 data/kaohsiung.json 產生本機 KV bulk-put JSON 與 D1 seed SQL,
供 `wrangler kv bulk put --local` / `wrangler d1 execute --local` 使用。
完全在本機檔案系統操作,不接觸真實 Cloudflare 帳號。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "kaohsiung.json"
OUT_DIR = ROOT / ".local-seed"
OUT_DIR.mkdir(exist_ok=True)

CITY_SLUG = "kaohsiung"

def parse_point_id(point_id: str):
    m = re.match(r"^[A-Z]+-([A-Z]+)-(\d+)$", point_id)
    if not m:
        raise ValueError(f"cannot parse point_id: {point_id}")
    return m.group(1).lower(), m.group(2)

def main():
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    publishable = [p for p in raw if p.get("district") and p.get("point_name") and p.get("schedule")]
    print(f"total={len(raw)} publishable={len(publishable)}", file=sys.stderr)

    districts = {}
    for p in publishable:
        district_slug, point_slug = parse_point_id(p["point_id"])
        p["_district_slug"] = district_slug
        p["_point_slug"] = point_slug
        districts.setdefault(district_slug, []).append(p)

    # ---- KV bulk file ----
    kv_entries = []
    for p in publishable:
        clean = {k: v for k, v in p.items() if not k.startswith("_")}
        kv_entries.append({"key": f"point:{p['point_id']}", "value": json.dumps(clean, ensure_ascii=False)})
    for district_slug, pts in districts.items():
        clean_list = [{k: v for k, v in p.items() if not k.startswith("_")} for p in pts]
        kv_entries.append({
            "key": f"district:{CITY_SLUG}:{district_slug}",
            "value": json.dumps(clean_list, ensure_ascii=False),
        })

    kv_path = OUT_DIR / "kv-bulk.json"
    kv_path.write_text(json.dumps(kv_entries, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {kv_path} entries={len(kv_entries)} size={kv_path.stat().st_size/1024/1024:.1f}MB", file=sys.stderr)

    # ---- D1 schema + seed ----
    schema_sql = """
DROP TABLE IF EXISTS points;
CREATE TABLE points (
  point_id TEXT PRIMARY KEY,
  city TEXT,
  city_slug TEXT,
  district TEXT,
  district_slug TEXT,
  village TEXT,
  point_name TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  schedule TEXT,
  recycling_schedule TEXT,
  collection_type TEXT,
  notes TEXT,
  source TEXT,
  fetched_at TEXT
);
CREATE INDEX idx_points_district ON points(city_slug, district_slug);
""".strip()
    (OUT_DIR / "d1-schema.sql").write_text(schema_sql + "\n", encoding="utf-8")

    def sql_str(v):
        if v is None:
            return "NULL"
        return "'" + str(v).replace("'", "''") + "'"

    def sql_num(v):
        return "NULL" if v is None else str(v)

    lines = []
    batch = []
    BATCH_SIZE = 200

    def flush():
        if not batch:
            return
        cols = "(point_id, city, city_slug, district, district_slug, village, point_name, address, lat, lng, schedule, recycling_schedule, collection_type, notes, source, fetched_at)"
        stmt = f"INSERT INTO points {cols} VALUES\n" + ",\n".join(batch) + ";"
        lines.append(stmt)
        batch.clear()

    for p in publishable:
        row = (
            "(" +
            sql_str(p["point_id"]) + "," +
            sql_str(p["city"]) + "," +
            sql_str(CITY_SLUG) + "," +
            sql_str(p["district"]) + "," +
            sql_str(p["_district_slug"]) + "," +
            sql_str(p.get("village")) + "," +
            sql_str(p.get("point_name")) + "," +
            sql_str(p.get("address")) + "," +
            sql_num(p.get("lat")) + "," +
            sql_num(p.get("lng")) + "," +
            sql_str(json.dumps(p["schedule"], ensure_ascii=False)) + "," +
            sql_str(json.dumps(p["recycling_schedule"], ensure_ascii=False) if p.get("recycling_schedule") else None) + "," +
            sql_str(p["collection_type"]) + "," +
            sql_str(p.get("notes")) + "," +
            sql_str(p["source"]) + "," +
            sql_str(p["fetched_at"]) +
            ")"
        )
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            flush()
    flush()

    seed_path = OUT_DIR / "d1-seed.sql"
    seed_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {seed_path} rows={len(publishable)} size={seed_path.stat().st_size/1024/1024:.1f}MB", file=sys.stderr)

    # remember a few sample point ids for curl testing later
    samples = publishable[:3] + publishable[len(publishable)//2:len(publishable)//2+2]
    sample_path = OUT_DIR / "sample-points.json"
    sample_path.write_text(json.dumps([
        {"point_id": p["point_id"], "district_slug": p["_district_slug"], "point_slug": p["_point_slug"]}
        for p in samples
    ], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {sample_path}", file=sys.stderr)

if __name__ == "__main__":
    main()
