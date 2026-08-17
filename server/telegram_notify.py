"""
Telegram notification helper.

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment (loaded from
the project .env file). If either is missing, notifications are disabled and the
server still runs normally.

Setup:
  1. Talk to @BotFather in Telegram -> /newbot -> copy the bot token.
  2. Send a message to your new bot (press Start) so it may message you back.
  3. Get your numeric chat id from @userinfobot (or the getUpdates endpoint).
  4. Put both values in .env:
        TELEGRAM_BOT_TOKEN=123456789:AA...
        TELEGRAM_CHAT_ID=123456789
"""
import os
import logging

import requests

logger = logging.getLogger(__name__)

_API = "https://api.telegram.org/bot{token}/sendMessage"
_TIMEOUT = 8


def _token() -> str:
    return (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()


def _chat_id() -> str:
    return (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()


def is_configured() -> bool:
    tok, cid = _token(), _chat_id()
    return bool(tok) and bool(cid) and tok != "your_bot_token_here"


def send_message(text: str) -> dict:
    """Send a Markdown message. Returns {ok, error?}."""
    if not is_configured():
        return {"ok": False, "error": "Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env)."}
    try:
        resp = requests.post(
            _API.format(token=_token()),
            json={
                "chat_id": _chat_id(),
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            },
            timeout=_TIMEOUT,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Telegram API error: %s", data)
            return {"ok": False, "error": data.get("description", "unknown error")}
        return {"ok": True}
    except Exception as exc:  # network / timeout / json errors
        logger.warning("Telegram send failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _fmt_amount(v) -> str:
    try:
        return f"${float(v):,.2f}"
    except (TypeError, ValueError):
        return str(v)


def send_fraud_alert(transaction: dict, result: dict) -> dict:
    """Compose and send a fraud alert from a transaction + prediction result."""
    base = result.get("base_models", {})
    text = (
        "🚨 *FRAUD DETECTED*\n"
        f"*Probability:* {result.get('probability', 0) * 100:.2f}%  "
        f"(threshold {result.get('threshold', 0) * 100:.1f}%)\n"
        f"*Amount:* {_fmt_amount(transaction.get('amt'))}\n"
        f"*Merchant:* {transaction.get('merchant', 'n/a')}\n"
        f"*Category:* {transaction.get('category', 'n/a')}\n"
        f"*Location:* {transaction.get('city', 'n/a')}, {transaction.get('state', 'n/a')}\n"
        f"*Time:* {transaction.get('trans_date_trans_time', 'n/a')}\n"
        "\n*Model scores:* "
        f"RF {base.get('random_forest', 0):.3f} · "
        f"CAT {base.get('catboost', 0):.3f} · "
        f"XGB {base.get('xgboost', 0):.3f}"
    )
    return send_message(text)
