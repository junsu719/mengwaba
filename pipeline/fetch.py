"""各來源垃圾車清運點資料抓取器。高雄市(Phase 1)、臺中市(Phase 4)。

資料來源決策與 robots.txt 現況見 ../DECISIONS.md(2026-07-09、2026-07-16)。
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.notify import notify_failure  # noqa: E402

USER_AGENT = "trash-pseo/0.1 (+contact: junsu578@gmail.com)"
TAIPEI_TZ = timezone(timedelta(hours=8))
RAW_DIR = ROOT / "data" / "raw"


class KaohsiungOpenDataFetcher:
    """高雄市政府資料開放平台:垃圾清運路線及時間(全市單一 CSV 資源)。

    低頻善意抓取:每次執行僅發出一次 HTTP 請求,不做任何頁面爬蟲或批次探索。
    """

    CITY_KEY = "kaohsiung"
    CITY = "高雄市"
    DATASET_URL = "https://data.kcg.gov.tw/DataSet/Detail/074c805a-00e1-4fc5-b5f8-b2f4d6b64aa4"
    RESOURCE_URL = "https://data.kcg.gov.tw/File/DirectDownload/a6ba725a-488c-4d40-b5a2-c2fe65d3e134"

    def fetch(self) -> list[dict]:
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
            resp = client.get(self.RESOURCE_URL)
            resp.raise_for_status()
        text = resp.content.decode("utf-8-sig")
        import csv
        import io

        reader = csv.DictReader(io.StringIO(text))
        return list(reader)


class TaichungOpenDataFetcher:
    """臺中市定時定點垃圾收運地點(data.gov.tw 資料集 84004,官方註冊 API 資源)。

    resourceDownloadUrl 為 data.gov.tw 平台登記的正式資源下載端點(JSON),
    非網頁爬蟲。低頻善意抓取:每次執行僅發出一次 HTTP 請求。決策見 DECISIONS.md(2026-07-16)。
    """

    CITY_KEY = "taichung"
    CITY = "臺中市"
    DATASET_URL = "https://data.gov.tw/dataset/84004"
    RESOURCE_URL = (
        "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download"
        "?rid=68d1a87f-7baa-4b50-8408-c36a3a7eda68"
    )

    def fetch(self) -> list[dict]:
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60) as client:
            resp = client.get(self.RESOURCE_URL)
            resp.raise_for_status()
        return resp.json()


FETCHERS = {
    KaohsiungOpenDataFetcher.CITY_KEY: KaohsiungOpenDataFetcher,
    TaichungOpenDataFetcher.CITY_KEY: TaichungOpenDataFetcher,
}


def main() -> None:
    city_keys = sys.argv[1:]
    if not city_keys:
        print("[fetch] 用法: python pipeline/fetch.py <city_key> [city_key ...]", file=sys.stderr)
        print(f"[fetch] 可用 city_key: {', '.join(FETCHERS)}", file=sys.stderr)
        sys.exit(1)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for city_key in city_keys:
        fetcher_cls = FETCHERS.get(city_key)
        if fetcher_cls is None:
            print(f"[fetch] 未知的 city_key: {city_key!r}(可用: {', '.join(FETCHERS)})", file=sys.stderr)
            sys.exit(1)
        fetcher = fetcher_cls()
        try:
            rows = fetcher.fetch()
        except httpx.HTTPError as e:
            notify_failure("fetch", f"{fetcher.CITY}: {e}")
            print(f"[fetch] 抓取失敗: {e}", file=sys.stderr)
            sys.exit(1)

        out_path = RAW_DIR / f"{city_key}.json"
        payload = {
            "city": fetcher.CITY,
            "source": fetcher.DATASET_URL,
            "fetched_at": datetime.now(TAIPEI_TZ).isoformat(),
            "records": rows,
        }
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[fetch] {fetcher.CITY}: {len(rows)} 筆原始資料,已寫入 {out_path}")


if __name__ == "__main__":
    main()
