"""各來源垃圾車清運點資料抓取器。臺中市、新北市(Phase 4)。

資料來源決策與 robots.txt 現況見 ../DECISIONS.md(2026-07-09、2026-07-16、2026-07-28)。

高雄市原本的 KaohsiungOpenDataFetcher(CSV)已刪除:2026-07-21 發現該資料源整份很可能是
資源回收車路線、與一般垃圾車時刻混淆(詳見 DECISIONS.md),已改用官方 PDF 班表
(kepbgps.kcg.gov.tw/download_schedule.aspx,由 Jun 每季手動下載至
data/raw/kaohsiung-pdf/,見 pipeline/parse_kaohsiung_pdf.py),不再透過本腳本抓取,
故意不留舊 fetcher 類別,避免有人誤執行 `fetch.py kaohsiung` 又抓回已知錯誤的資料源。
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


class XinbeiOpenDataFetcher:
    """新北市垃圾車路線(data.ntpc.gov.tw 資料集 edc3ad26-8ae7-4916-a00b-bc6048d19bf8,
    提供機關新北市政府環境保護局,官方 OpenAPI 端點)。

    單一 GET 請求(size=30000 一次拉全量 26,671 筆)取得全市資料,非分頁爬取、
    非網頁爬蟲。授權為政府資料開放授權條款第一版,同高雄/台中/桃園。
    robots.txt 因站台 WAF 攔截無法自動讀取實際條文(已知限制,見 DECISIONS.md),
    Jun 已知悉此限制並拍板開工。決策見 DECISIONS.md(2026-07-28)。
    """

    CITY_KEY = "xinbei"
    CITY = "新北市"
    DATASET_URL = "https://data.ntpc.gov.tw/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8"
    RESOURCE_URL = (
        "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/json?size=30000"
    )

    def fetch(self) -> list[dict]:
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60) as client:
            resp = client.get(self.RESOURCE_URL)
            resp.raise_for_status()
        return resp.json()


FETCHERS = {
    TaichungOpenDataFetcher.CITY_KEY: TaichungOpenDataFetcher,
    XinbeiOpenDataFetcher.CITY_KEY: XinbeiOpenDataFetcher,
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
