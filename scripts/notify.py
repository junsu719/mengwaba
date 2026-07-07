"""Telegram 通知模組。供 daily.sh 與各 pipeline 腳本呼叫,回報成功/失敗。"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def send(message: str) -> bool:
    """發送一則 Telegram 訊息。回傳是否成功(不拋例外,呼叫端可自行決定失敗後續處理)。"""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print(f"[notify] 缺少 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID,訊息未送出: {message}", file=sys.stderr)
        return False

    url = TELEGRAM_API.format(token=token)
    try:
        resp = httpx.post(url, data={"chat_id": chat_id, "text": message}, timeout=10)
        resp.raise_for_status()
        return True
    except httpx.HTTPError as e:
        print(f"[notify] Telegram 發送失敗: {e}", file=sys.stderr)
        return False


def notify_success(city_count: int, point_count: int, added: int, removed: int) -> bool:
    msg = f"✅ 部署成功|{city_count} 縣市|{point_count:,} 清運點|新增 {added} / 移除 {removed}"
    return send(msg)


def notify_failure(stage: str, detail: str) -> bool:
    msg = f"❌ 失敗於 {stage}|{detail}"
    return send(msg)


if __name__ == "__main__":
    # 手動測試: python scripts/notify.py "任意測試訊息"
    test_message = sys.argv[1] if len(sys.argv) > 1 else "trash-pseo Telegram 通知模組測試"
    ok = send(test_message)
    print("送出成功" if ok else "送出失敗,請檢查 .env 設定")
