"""各來源垃圾車清運點資料抓取器。目前僅實作高雄市(Phase 1)。

資料來源決策與 robots.txt 現況見 ../DECISIONS.md(2026-07-09)。
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


def main() -> None:
    fetcher = KaohsiungOpenDataFetcher()
    try:
        rows = fetcher.fetch()
    except httpx.HTTPError as e:
        notify_failure("fetch", f"{fetcher.CITY}: {e}")
        print(f"[fetch] 抓取失敗: {e}", file=sys.stderr)
        sys.exit(1)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / "kaohsiung.json"
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
