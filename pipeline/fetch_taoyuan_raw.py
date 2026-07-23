"""桃園市原始資料抓取:垃圾清運路線即時查詢系統(route.tyoem.gov.tw)。

背景見 DECISIONS.md 2026-07-23。桃園沒有開放資料 API 可用(舊平台 data.tycg.gov.tw
已 NXDOMAIN、新平台 opendata.tycg.gov.tw 被 WAF 擋自動化),改用環管處「垃圾清運路線
即時查詢系統」內部查詢端點 `POST /web/dataManagerAgentWeb.jsp`(dcfid 分派模式),
需先 GET 首頁取得 random_form token + session cookie 才能查詢。

本檔案是「原始資料抓取」這一步,只負責把來源回傳的原始 JSON 逐路線落地到
data/raw/taoyuan/,**尚未**接上 normalize.py 或 fetch.py 既有的 FETCHERS/CLI 慣例
(那兩支腳本目前是 city_key 參數化的統一介面,桃園要接進去需要另外設計,見
D4 決策:recycling_schedule 的正確合成方式是「lagi/recycle 兩次查詢結果的
poi_id 聯集」,不是單純的「有資料就照抄」,這段邏輯放在 normalize 階段做,
不在這支抓取腳本裡)。

用法:
  python3 pipeline/fetch_taoyuan_raw.py <行政區gid1> <行政區gid2> ...
  例如: python3 pipeline/fetch_taoyuan_raw.py lagi2-001 lagi2-002

13 個行政區 gid 對照表見 data/raw/taoyuan/routes/(每區一份路線清單,
即 lagifQueryRouteByTown 的回應原文,是本腳本查詢逐路線時刻表時的輸入)。

可重複執行、可中斷續跑:每條路線 × car_type 各自存成一個檔案
(data/raw/taoyuan/{gid}__{routing_id}__{car_type}.json),已存在的檔案會跳過,
不會重複打請求。節流 2 秒(鐵律 3),User-Agent 誠實標明專案名稱與聯絡方式。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "taoyuan"
ROUTES_DIR = RAW_DIR / "routes"

UA = "trash-pseo/0.1 (+contact: junsu578@gmail.com)"
ENDPOINT = "https://route.tyoem.gov.tw/web/dataManagerAgentWeb.jsp"
HOME = "https://route.tyoem.gov.tw/"
THROTTLE_SEC = 2.0

DISTRICT_GIDS = [f"lagi2-{i:03d}" for i in range(1, 14)]


def curl(args: list[str], timeout: int = 20) -> tuple[str, int]:
    """python 內建 SSL 對這個站的憑證鏈(缺 Subject Key Identifier)驗證過嚴會失敗,
    curl 實測沒這個問題,故 shell out 用 curl 發請求,不修改本機/系統的 SSL 信任設定。"""
    cmd = ["curl", "-sS", "--max-time", str(timeout), "-A", UA] + args
    result = subprocess.run(cmd, capture_output=True, timeout=timeout + 5)
    return result.stdout.decode("utf-8", "ignore"), result.returncode


def get_session() -> tuple[str, str]:
    cookiejar = str(Path(tempfile.gettempdir()) / "trash-pseo-taoyuan-cookies.txt")
    html, rc = curl(["-c", cookiejar, HOME])
    if rc != 0:
        raise RuntimeError(f"GET 首頁失敗 rc={rc}")
    # random_form 是有號 64-bit 亂數,偶爾為負值,regex 需含可選負號。
    m = re.search(r'id="random_form"[^>]*value="(-?\d+)"', html)
    token = m.group(1) if m else None
    if not token:
        raise RuntimeError("找不到 random_form token")
    return token, cookiejar


def post(dcfid: str, params: dict, token: str, cookiejar: str) -> dict:
    args = ["-b", cookiejar]
    for k, v in {"dcfid": dcfid, "random_form": token, **params}.items():
        args += ["--data-urlencode", f"{k}={v}"]
    args += [ENDPOINT]
    body, rc = curl(args)
    if rc != 0:
        raise RuntimeError(f"curl rc={rc}")
    return json.loads(body)


def fetch_district(gid: str, token: str, cookiejar: str, log) -> int:
    route_file = ROUTES_DIR / f"{gid}.json"
    routes = json.load(open(route_file, encoding="utf-8"))["result"]
    done, skipped, failed = 0, 0, 0
    for r in routes:
        routing_id = r["routing_id"]
        for car_type in ("lagi", "recycle"):
            out_path = RAW_DIR / f"{gid}__{routing_id}__{car_type}.json"
            if out_path.exists():
                skipped += 1
                continue
            time.sleep(THROTTLE_SEC)
            try:
                result = post(
                    "lagifQueryTimeTableDetailByRoute",
                    {"routing_id": routing_id, "car_type": car_type},
                    token,
                    cookiejar,
                )
            except Exception as e:
                print(f"  [FAIL] {gid} {routing_id} {car_type}: {e}", file=sys.stderr)
                log.write(f"FAIL\t{gid}\t{routing_id}\t{car_type}\t{e}\n")
                log.flush()
                failed += 1
                continue
            if result.get("errCode") != "0000":
                print(f"  [ERR] {gid} {routing_id} {car_type}: {result}", file=sys.stderr)
                log.write(f"ERR\t{gid}\t{routing_id}\t{car_type}\t{result.get('msg')}\n")
                log.flush()
                failed += 1
                continue
            out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            done += 1
    print(f"[{gid}] done={done} skipped={skipped} failed={failed} (共 {len(routes)} 條路線)")
    log.write(f"DISTRICT_DONE\t{gid}\tdone={done}\tskipped={skipped}\tfailed={failed}\n")
    log.flush()
    return failed


def main() -> None:
    gids = sys.argv[1:]
    if not gids:
        print(f"usage: {sys.argv[0]} <gid1> <gid2> ...\n可用 gid: {', '.join(DISTRICT_GIDS)}", file=sys.stderr)
        sys.exit(1)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    token, cookiejar = get_session()
    print(f"session token={token}")

    total_failed = 0
    with open(RAW_DIR / "fetch_progress.log", "a", encoding="utf-8") as log:
        for gid in gids:
            if gid not in DISTRICT_GIDS:
                print(f"unknown gid: {gid}", file=sys.stderr)
                continue
            total_failed += fetch_district(gid, token, cookiejar, log)

    print(f"batch complete. total_failed={total_failed}")


if __name__ == "__main__":
    main()
