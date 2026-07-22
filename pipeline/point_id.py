"""穩定 point_id 產生器:內容雜湊 + 同址多筆消歧對照表。

背景:2026-07-21 發現高雄舊資料源(CSV)整份可能是資源回收車路線,改用官方 PDF 班表
(kepbgps.kcg.gov.tw)重新解析。PDF 沒有可沿用的穩定序號欄位,若比照舊做法用「PDF 逐列
出現順序」編號,官方調整 PDF 內部排列順序時全部 URL 會跟著洗牌。改用「地點描述文字」
的內容雜湊當 ID:只要「里別+清運點」文字不變,ID 就不變,不受列順序、新增/刪除其他點
影響。台中舊制 `TXG-{區}-{全域序號}` 有同樣的整批洗牌風險,現在(GSC 尚未提交、流量為零)
一併改用同一套規則,兩縣市規則一致,之後擴充其他縣市比照辦理。詳見 DECISIONS.md。

同址多筆班次(同一地址有兩班不同時間的車,非資料錯誤,見三民區驗證報告)需要消歧:
用一份 git 版控的對照表(data/id-map/{city_key}.json)記錄每筆的消歧指紋(車牌+首個抵達
時間),下次更新時優先用車牌完全比對、其次用抵達時間最接近配對既有列,只有真正新出現的
列才分配新的消歧序號——確保「未變動的清運點」跨季更新後 URL 不變。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, TypedDict

ROOT = Path(__file__).resolve().parent.parent
ID_MAP_DIR = ROOT / "data" / "id-map"

HASH_HEX_LEN = 10  # 40 bits;同一行政區內筆數最多約數千筆,碰撞機率可忽略(見調查記錄)


class IdentityRow(TypedDict):
    district_slug: str
    village: str | None
    point_name: str
    plate: str | None
    first_arrive: str | None  # "HH:MM",找不到有效班次時可為 None


def _hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:HASH_HEX_LEN].upper()


def _time_to_min(t: str | None) -> int | None:
    if not t:
        return None
    try:
        h, m = t.split(":")
        return int(h) * 60 + int(m)
    except ValueError:
        return None


def _base_key(village: str | None, point_name: str) -> str:
    return f"{village or ''}|{point_name}"


def assign_point_ids(city_key: str, prefix: str, rows: list[IdentityRow]) -> list[str]:
    """為一批同縣市原始列分配穩定 point_id,回傳與 rows 等長、依序對應的 id 清單。

    會讀取並覆寫 data/id-map/{city_key}.json(需 git 追蹤,遺失即無法保證跨季 URL 穩定)。
    """
    map_path = ID_MAP_DIR / f"{city_key}.json"
    id_map: dict[str, dict[str, list[dict[str, Any]]]] = {}
    if map_path.exists():
        id_map = json.loads(map_path.read_text(encoding="utf-8"))

    by_district: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        by_district.setdefault(r["district_slug"], []).append(i)

    result_ids: list[str | None] = [None] * len(rows)
    seen_hashes_this_run: dict[str, str] = {}  # district_slug 內:hash -> base_key,偵測跨 key 碰撞

    for district_slug, idxs in by_district.items():
        district_map = id_map.setdefault(district_slug, {})

        groups: dict[str, list[int]] = {}
        for i in idxs:
            r = rows[i]
            groups.setdefault(_base_key(r["village"], r["point_name"]), []).append(i)

        for base_key, group_idxs in groups.items():
            existing = district_map.get(base_key, [])

            if len(group_idxs) == 1 and not existing:
                pid = f"{prefix}-{district_slug.upper()}-{_hash(base_key)}"
                _check_collision(seen_hashes_this_run, district_slug, pid, base_key)
                result_ids[group_idxs[0]] = pid
                district_map[base_key] = [
                    {
                        "point_id": pid,
                        "plate": rows[group_idxs[0]].get("plate"),
                        "first_arrive": rows[group_idxs[0]].get("first_arrive"),
                    }
                ]
                continue

            # 同址多筆(現在或曾經出現過):需要消歧,分三輪比對既有對照表
            entries = list(existing)
            used_existing: set[int] = set()

            # 第一輪:車牌完全比對
            for i in group_idxs:
                plate = rows[i].get("plate")
                if not plate:
                    continue
                for j, e in enumerate(entries):
                    if j in used_existing:
                        continue
                    if e.get("plate") == plate:
                        used_existing.add(j)
                        result_ids[i] = entries[j]["point_id"]
                        entries[j]["plate"] = plate
                        entries[j]["first_arrive"] = rows[i].get("first_arrive")
                        break

            # 第二輪:剩下的用「首個抵達時間」最接近配對既有列
            remaining_rows = [i for i in group_idxs if result_ids[i] is None]
            remaining_entries = [j for j in range(len(entries)) if j not in used_existing]
            for i in list(remaining_rows):
                rm = _time_to_min(rows[i].get("first_arrive"))
                if rm is None:
                    continue
                best_j, best_diff = None, None
                for j in remaining_entries:
                    em = _time_to_min(entries[j].get("first_arrive"))
                    if em is None:
                        continue
                    diff = abs(em - rm)
                    if best_diff is None or diff < best_diff:
                        best_diff, best_j = diff, j
                if best_j is not None:
                    remaining_entries.remove(best_j)
                    remaining_rows.remove(i)
                    result_ids[i] = entries[best_j]["point_id"]
                    entries[best_j]["plate"] = rows[i].get("plate")
                    entries[best_j]["first_arrive"] = rows[i].get("first_arrive")

            # 第二輪半:車牌、抵達時間皆缺(如台中部分「僅資源回收無一般垃圾」列,
            # 見 2026-07-21 重跑驗證發現),已無任何可比對的信號時,依原始順序position-pair
            # 剩下的列與既有條目——只要來源資料本身順序不變,這樣仍能保持 ID 穩定,
            # 優於「一律當新點」導致同一批資料重跑就整批洗牌。
            for i, j in zip(list(remaining_rows), list(remaining_entries)):
                remaining_rows.remove(i)
                remaining_entries.remove(j)
                result_ids[i] = entries[j]["point_id"]
                entries[j]["plate"] = rows[i].get("plate")
                entries[j]["first_arrive"] = rows[i].get("first_arrive")

            # 第三輪:真正新出現的列,分配新的消歧序號(接在既有筆數之後,不重用)
            for i in remaining_rows:
                disambig = len(entries)
                pid = f"{prefix}-{district_slug.upper()}-{_hash(f'{base_key}#{disambig}')}"
                _check_collision(seen_hashes_this_run, district_slug, pid, f"{base_key}#{disambig}")
                result_ids[i] = pid
                entries.append(
                    {
                        "point_id": pid,
                        "plate": rows[i].get("plate"),
                        "first_arrive": rows[i].get("first_arrive"),
                    }
                )

            # 注意:existing 中未被配對到的舊條目(該筆班次已消失)刻意保留、不刪除,
            # 避免下次萬一同址班次重新出現時,消歧序號被重新分配、跟其他現存列打架。
            district_map[base_key] = entries

    assert all(x is not None for x in result_ids), "有列未分配到 point_id,邏輯有誤"

    map_path.parent.mkdir(parents=True, exist_ok=True)
    map_path.write_text(json.dumps(id_map, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

    return result_ids  # type: ignore[return-value]


def _check_collision(seen: dict[str, str], district_slug: str, pid: str, key: str) -> None:
    scoped = f"{district_slug}:{pid}"
    if scoped in seen and seen[scoped] != key:
        raise RuntimeError(
            f"point_id 雜湊碰撞:{pid}(區 {district_slug})同時對應到 {seen[scoped]!r} 與 {key!r},"
            "需要人工介入(加長雜湊或另訂規則),不可靜默覆蓋。"
        )
    seen[scoped] = key
