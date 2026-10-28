"""外國節日比對功能:下載日本內閣府 syukujitsu.csv 與新加坡 MOM 公眾假期資料(data.gov.sg)的原始檔,
原樣存進 data/raw/foreign-holidays/(不轉碼、不改內容,保留可稽核性)。
單一來源失敗就中止,不留半套。季度/年度手動執行。"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "foreign-holidays"
UA = "mengwaba-calendar/1.0 (+https://mengwaba.com; junsu578@gmail.com)"

JP_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"
# data.gov.sg「Public Holidays for {year}」資料集 ID(MOM 發布,每年一個資料集)
SG_DATASETS = {
    2026: "d_149b61ad0a22f61c09dc80f2df5bbec8",
    2027: "d_0ba69fc6d56717ff0bf8083c6af3bb84",
}
SG_API = "https://api-open.data.gov.sg/v1/public/api/datasets/{id}"
SG_META = "https://api-production.data.gov.sg/v2/public/api/datasets/{id}/metadata"


def fetch_jp(client: httpx.Client) -> None:
    r = client.get(JP_URL)
    r.raise_for_status()
    (RAW_DIR / "syukujitsu.csv").write_bytes(r.content)
    print(f"JP syukujitsu.csv {len(r.content)} bytes (last-modified: {r.headers.get('last-modified')})")


def get_with_backoff(client: httpx.Client, url: str) -> httpx.Response:
    """data.gov.sg 有速率限制(429);退避重試而非硬撞,最多等約 4 分鐘。"""
    for attempt in range(5):
        r = client.get(url)
        if r.status_code != 429:
            r.raise_for_status()
            return r
        wait = 30 * (attempt + 1)
        print(f"429,{wait} 秒後重試", file=sys.stderr)
        time.sleep(wait)
    sys.exit(f"{url} 持續被限流,放棄")


def fetch_sg(client: httpx.Client, year: int, dataset_id: str) -> None:
    base = SG_API.format(id=dataset_id)
    get_with_backoff(client, f"{base}/initiate-download")
    url = None
    for _ in range(10):
        time.sleep(2)
        data = client.get(f"{base}/poll-download").json().get("data") or {}
        if data.get("status") == "DOWNLOAD_SUCCESS":
            url = data["url"]
            break
    if not url:
        sys.exit(f"SG {year}: 下載連結未在時限內就緒")
    csv_resp = client.get(url)
    csv_resp.raise_for_status()
    (RAW_DIR / f"sg-public-holidays-{year}.csv").write_bytes(csv_resp.content)
    time.sleep(2)
    meta = client.get(SG_META.format(id=dataset_id)).json()
    (RAW_DIR / f"sg-public-holidays-{year}.metadata.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"SG {year} {len(csv_resp.content)} bytes (lastUpdatedAt: {meta['data'].get('lastUpdatedAt')})")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True) as client:
        fetch_jp(client)
        for year, ds in SG_DATASETS.items():
            time.sleep(2)  # 抓取節流 ≥ 2 秒(專案鐵律 3)
            fetch_sg(client, year, ds)


if __name__ == "__main__":
    main()
