# schwab/client_multi.py
# Per-user Schwab client that loads tokens from the database
# instead of a shared tokens.json file

import base64
import httpx
import time
from models import SchwabToken
from config import settings

TRADER_BASE = "https://api.schwabapi.com/trader/v1"
MARKET_BASE = "https://api.schwabapi.com/marketdata/v1"
TOKEN_URL   = "https://api.schwabapi.com/v1/oauth/token"


class UserSchwabClient:
    """
    Per-request Schwab client. Created fresh for each API request
    using the token record fetched from the database for the current user.
    """

    def __init__(self, token_record: SchwabToken, db_session):
        self._token   = token_record
        self._db      = db_session
        self._app_key = settings.schwab_app_key
        self._secret  = settings.schwab_app_secret

    def _is_valid(self) -> bool:
        return (self._token.expiry or 0) > time.time() + 60

    async def _refresh(self):
        if not self._token.refresh_token:
            raise Exception("No refresh token. Please reconnect your Schwab account.")

        creds = base64.b64encode(f"{self._app_key}:{self._secret}".encode()).decode()
        response = httpx.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={
                "grant_type":    "refresh_token",
                "refresh_token": self._token.refresh_token,
            },
        )
        response.raise_for_status()
        data = response.json()

        self._token.access_token = data["access_token"]
        self._token.expiry       = int(time.time()) + data.get("expires_in", 1800)
        if "refresh_token" in data:
            self._token.refresh_token = data["refresh_token"]

        await self._db.commit()

    async def _headers(self) -> dict:
        if not self._is_valid():
            await self._refresh()
        return {"Authorization": f"Bearer {self._token.access_token}"}

    # ── Account methods ───────────────────────────────────────────────────────

    async def get_account_numbers(self) -> list:
        r = httpx.get(f"{TRADER_BASE}/accounts/accountNumbers", headers=await self._headers())
        r.raise_for_status()
        return r.json()

    async def get_accounts(self) -> list:
        r = httpx.get(f"{TRADER_BASE}/accounts", headers=await self._headers())
        r.raise_for_status()
        return r.json()

    async def get_portfolio(self, account_hash: str) -> dict:
        r = httpx.get(f"{TRADER_BASE}/accounts/{account_hash}", params={"fields": "positions"}, headers=await self._headers())
        r.raise_for_status()
        return r.json()

    # ── Quote methods ─────────────────────────────────────────────────────────

    async def get_quote(self, symbol: str) -> dict:
        r = httpx.get(f"{MARKET_BASE}/quotes", params={"symbols": symbol}, headers=await self._headers())
        r.raise_for_status()
        return r.json()

    async def get_quotes(self, symbols: list) -> dict:
        r = httpx.get(f"{MARKET_BASE}/quotes", params={"symbols": ",".join(symbols)}, headers=await self._headers())
        r.raise_for_status()
        return r.json()

    async def get_price_history(self, symbol, period_type="day", period=1, frequency_type="minute", frequency=1, need_extended_hours_data=True) -> dict:
        r = httpx.get(
            f"{MARKET_BASE}/pricehistory",
            params={
                "symbol": symbol, "periodType": period_type, "period": period,
                "frequencyType": frequency_type, "frequency": frequency,
                "needExtendedHoursData": str(need_extended_hours_data).lower(),
            },
            headers=await self._headers(),
        )
        r.raise_for_status()
        return r.json()

    async def get_options_chain(self, symbol, contract_type="ALL", strike_count=20) -> dict:
        r = httpx.get(
            f"{MARKET_BASE}/chains",
            params={
                "symbol": symbol, "contractType": contract_type,
                "strikeCount": strike_count, "includeUnderlyingQuote": "true",
            },
            headers=await self._headers(),
        )
        r.raise_for_status()
        return r.json()

    # ── Order methods ─────────────────────────────────────────────────────────

    async def get_orders(self, account_hash: str, days_back: int = 60) -> list:
        from datetime import datetime, timedelta
        now       = datetime.utcnow()
        from_time = (now - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        to_time   = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        r = httpx.get(
            f"{TRADER_BASE}/accounts/{account_hash}/orders",
            params={"fromEnteredTime": from_time, "toEnteredTime": to_time, "maxResults": 250},
            headers=await self._headers(),
        )
        r.raise_for_status()
        return r.json()

    async def place_order(self, account_hash: str, order: dict) -> dict:
        r = httpx.post(
            f"{TRADER_BASE}/accounts/{account_hash}/orders",
            headers={**await self._headers(), "Content-Type": "application/json"},
            json=order,
        )
        r.raise_for_status()
        location = r.headers.get("location", "")
        order_id = location.split("/")[-1] if location else None
        return {"order_id": order_id, "status": "placed"}

    async def cancel_order(self, account_hash: str, order_id: str) -> dict:
        r = httpx.delete(
            f"{TRADER_BASE}/accounts/{account_hash}/orders/{order_id}",
            headers=await self._headers(),
        )
        r.raise_for_status()
        return {"order_id": order_id, "status": "cancelled"}
