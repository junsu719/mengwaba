"""建立舊格式(全域流水號)point_id → 新格式(內容雜湊)point_id 的 301 導向對照表。

背景:2026-07-22 point_id 從「資料來源逐列出現順序」的全域序號(如 KHH-MEINONG-06852)
改成內容雜湊方案(如 KHH-MEINONG-5B3D524957)後,已被 Google 索引的舊格式清運點網址全數
404。這支腳本用「里別 + 清運點名稱」當連結鍵,把 git 歷史裡最後一版舊格式 data/normalized/
(高雄 commit 24f32cc6、臺中 commit b713a4f6)比對到現行雜湊資料,重建可信賴的對照表。

高雄同時換了資料源(CSV→PDF,見 DECISIONS.md 2026-07-21),不是單純換 ID 算法,舊資料裡
有相當比例的點在新資料裡完全找不到對應(懷疑舊 CSV 實際是回收車路線與一般垃圾車混淆),
如實記錄「查無對應」,不猜測填補。臺中舊資料本身沒變(只是重新雜湊),預期 100% 可還原。

同一個(村里, 點名)在其中一側對到多筆時(同址多班次),用 schedule/recycling_schedule
的內容特徵(weekday/arrive/depart 排序後的集合)嘗試唯一配對;無法唯一配對的整組一律
視為「查無對應」,不猜測配對——寧可讓這些舊網址繼續 404,也不能導到錯的新網址。

輸出:data/legacy-redirects/{city_key}.json,格式:
  [{"district_slug": "meinong", "old_slug": "06852", "new_point_id": "KHH-MEINONG-5B3D524957"}, ...]
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
NORMALIZED_DIR = ROOT / "data" / "normalized"
OUT_DIR = ROOT / "data" / "legacy-redirects"

# city_key -> 舊格式資料最後一版所在的 git commit(207e215f/e821d293 之前,見 DECISIONS.md 考古紀錄)
LEGACY_COMMITS = {
    "kaohsiung": "24f32cc6",
    "taichung": "b713a4f6",
}


def _git_show(commit: str, path: str) -> list[dict[str, Any]]:
    result = subprocess.run(
        ["git", "show", f"{commit}:{path}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def _district_slug(point_id: str) -> str | None:
    parts = point_id.split("-")
    if len(parts) < 3:
        return None
    return parts[1].lower()


def _old_slug(point_id: str) -> str | None:
    parts = point_id.split("-")
    if len(parts) < 3:
        return None
    return "-".join(parts[2:])


def _key(record: dict[str, Any]) -> tuple[str, str]:
    return (record.get("village") or "", record.get("point_name") or "")


def _schedule_sig(record: dict[str, Any]) -> tuple:
    def norm(entries: list[dict[str, Any]] | None) -> tuple:
        return tuple(
            sorted(
                (tuple(e.get("weekday") or []), e.get("arrive"), e.get("depart"))
                for e in (entries or [])
            )
        )

    return (norm(record.get("schedule")), norm(record.get("recycling_schedule")))


def build_city(city_key: str) -> dict[str, Any]:
    legacy_commit = LEGACY_COMMITS[city_key]
    old_records = _git_show(legacy_commit, f"data/normalized/{city_key}.json")
    new_path = NORMALIZED_DIR / f"{city_key}.json"
    new_records = json.loads(new_path.read_text(encoding="utf-8"))

    old_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in old_records:
        old_groups.setdefault(_key(r), []).append(r)
    new_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in new_records:
        new_groups.setdefault(_key(r), []).append(r)

    mapping: list[dict[str, str]] = []
    stats = {
        "old_total": len(old_records),
        "matched_unique": 0,
        "ambiguous_skipped": 0,
        "ambiguous_groups": 0,
        "unmatched_no_key": 0,
    }

    for key, olds in old_groups.items():
        news = new_groups.get(key)
        if not news:
            stats["unmatched_no_key"] += len(olds)
            continue

        if len(olds) == 1 and len(news) == 1:
            pairs = [(olds[0], news[0])]
        else:
            old_sigs = [_schedule_sig(r) for r in olds]
            new_sig_count = Counter(_schedule_sig(r) for r in news)
            # 只有「每筆 old 的特徵在 new 裡剛好出現一次、且雙邊筆數相等」才視為可信賴配對,
            # 否則整組放棄——同組內特徵重複或筆數不對稱都代表無法唯一判定,不猜測配對。
            if len(olds) != len(news) or any(new_sig_count.get(s) != 1 for s in old_sigs):
                stats["ambiguous_skipped"] += len(olds)
                stats["ambiguous_groups"] += 1
                continue
            new_by_sig = {_schedule_sig(r): r for r in news}
            pairs = [(old_r, new_by_sig[_schedule_sig(old_r)]) for old_r in olds]

        for old_r, new_r in pairs:
            district_slug = _district_slug(old_r["point_id"])
            old_slug = _old_slug(old_r["point_id"])
            if district_slug is None or old_slug is None:
                stats["unmatched_no_key"] += 1
                continue
            mapping.append(
                {
                    "district_slug": district_slug,
                    "old_slug": old_slug,
                    "new_point_id": new_r["point_id"],
                }
            )
            stats["matched_unique"] += 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{city_key}.json"
    mapping.sort(key=lambda m: (m["district_slug"], m["old_slug"]))
    out_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")

    stats["mapping_count"] = len(mapping)
    stats["coverage_rate"] = round(len(mapping) / stats["old_total"], 4) if stats["old_total"] else 0.0
    return stats


def main() -> None:
    city_keys = sys.argv[1:] or list(LEGACY_COMMITS)
    for city_key in city_keys:
        if city_key not in LEGACY_COMMITS:
            print(f"[build_legacy_redirects] 未知或無需處理的 city_key: {city_key!r}(可用: {', '.join(LEGACY_COMMITS)})", file=sys.stderr)
            sys.exit(1)
        stats = build_city(city_key)
        print(f"[build_legacy_redirects] {city_key}: {json.dumps(stats, ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    main()
