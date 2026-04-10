# schwab/client_db.py
import base64
import time
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import SchwabToken
from config import settings

TRADER_BASE = "https://api.schwabapi.com/trader/v1"
MARKET_BASE = "https://api.schwabapi.com/marketdata/v1"
TOKEN_URL   = "https://api.schwabapi.com/v1/oauth/token"

class SchwabClientDB:
    def __init__(self, access_token, refresh_token, expiry, user_id, db):
        self.access_token  = access_token
        self.refresh_token = refresh_token
        self.expiry        = expiry
        self.user_id       = user_id
        self.db            = db

    def _is_valid(self):
        return time.time() < self.expiry - 60

    async def _refresh(self):
        creds = base64.b64encode(f"{settings.schwab_app_key}:{settings.schwab_app_secret}".encode()).decode()
        res = httpx.post(TOKEN_URL,
            headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
        )
        res.raise_for_status()
        data = res.json()
        self.access_token = data["access_token"]
        self.expiry       = int(time.time()) + data.get("expires_in", 1800)
        if "refresh_token" in data:
            self.refresh_token = data["refresh_token"]
        result = await self.db.execute(select(SchwabToken).where(SchwabToken.user_id == self.user_id))
        token  = result.scalar_one_or_none()
        if token:
            token.access_token  = self.access_token
            token.refresh_token = self.refresh_token
            token.expiry        = self.expiry
            await self.db.commit()

    async def _headers(self):
        if not self._is_valid():
            await self._refresh()
        return {"Authorization": f"Bearer {self.access_token}"}

    async def get_account_numbers(self):
        r = httpx.get(f"{TRADER_BASE}/accounts/accountNumbers", headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_accounts(self):
        r = httpx.get(f"{TRADER_BASE}/accounts", headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_portfolio(self, account_hash):
        r = httpx.get(f"{TRADER_BASE}/accounts/{account_hash}", params={"fields": "positions"}, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_quote(self, symbol):
        r = httpx.get(f"{MARKET_BASE}/quotes", params={"symbols": symbol}, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_quotes(self, symbols):
        r = httpx.get(f"{MARKET_BASE}/quotes", params={"symbols": ",".join(symbols)}, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_price_history(self, symbol, period_type, period, frequency_type, frequency, need_extended=True):
        r = httpx.get(f"{MARKET_BASE}/pricehistory", params={
            "symbol": symbol, "periodType": period_type, "period": period,
            "frequencyType": frequency_type, "frequency": frequency,
            "needExtendedHoursData": str(need_extended).lower(),
        }, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_options_chain(self, symbol, contract_type="ALL", strike_count=20):
        r = httpx.get(f"{MARKET_BASE}/chains", params={
            "symbol": symbol, "contractType": contract_type,
            "strikeCount": strike_count, "includeUnderlyingQuote": "true", "strategy": "SINGLE",
        }, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def get_orders(self, account_hash, days_back=60):
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        r = httpx.get(f"{TRADER_BASE}/accounts/{account_hash}/orders", params={
            "fromEnteredTime": (now - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "toEnteredTime":   now.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "maxResults": 250,
        }, headers=await self._headers())
        r.raise_for_status(); return r.json()

    async def place_order(self, account_hash, order):
        r = httpx.post(f"{TRADER_BASE}/accounts/{account_hash}/orders",
            headers={**await self._headers(), "Content-Type": "application/json"}, json=order)
        if not r.is_success:
            # Propagate Schwab's actual error body so the frontend can display it
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise Exception(f"Schwab {r.status_code}: {detail}")
        location = r.headers.get("location", "")
        return {"order_id": location.split("/")[-1] if location else None, "status": "placed"}

    async def cancel_order(self, account_hash, order_id):
        r = httpx.delete(f"{TRADER_BASE}/accounts/{account_hash}/orders/{order_id}", headers=await self._headers())
        r.raise_for_status(); return {"order_id": order_id, "status": "cancelled"}


async def get_schwab_client(user_id: str, db: AsyncSession) -> "SchwabClientDB":
    result = await db.execute(select(SchwabToken).where(SchwabToken.user_id == user_id))
    token  = result.scalar_one_or_none()
    if not token:
        raise Exception("Schwab not connected. Please connect your Schwab account.")
    return SchwabClientDB(
        access_token=token.access_token,
        refresh_token=token.refresh_token,
        expiry=token.expiry,
        user_id=user_id,
        db=db,
    )
