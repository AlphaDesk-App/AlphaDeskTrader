from datetime import datetime, timedelta
# schwab/client.py
#
# This is the most important file in the backend.
# It handles everything related to talking to the Schwab API:
#   - Loading your saved tokens from disk
#   - Automatically refreshing the access token when it expires
#   - Making the actual API calls for accounts and quotes
#
# Every other part of the app imports from this file.
# Nothing else talks to Schwab directly — it all goes through here.

import json       # for reading and writing tokens.json
import time       # for checking if the token has expired
import base64     # for encoding your app key and secret (Schwab requires this)
import httpx      # the HTTP client — this is what actually sends requests to Schwab
from config import settings  # your keys and token path from .env


# ── Schwab API Base URLs ───────────────────────────────────────────────────────
#
# Schwab splits its API into two separate base URLs:
#   TRADER_BASE → everything account and order related
#   MARKET_BASE → everything market data related (quotes, chains)
#
# We define them once here so we never hardcode a full URL anywhere else.
# If Schwab ever changes a URL, you fix it in one place.

TRADER_BASE = "https://api.schwabapi.com/trader/v1"
MARKET_BASE = "https://api.schwabapi.com/marketdata/v1"
TOKEN_URL   = "https://api.schwabapi.com/v1/oauth/token"


# ── The Client Class ──────────────────────────────────────────────────────────
#
# A class is a blueprint for an object. SchwabClient is an object that holds
# your credentials, your tokens, and all the methods for calling the API.
# At the bottom of this file we create one instance of it called `schwab`.
# Every other file imports that one instance — they don't create their own.

class SchwabClient:

    def __init__(self):
        # __init__ runs automatically when the object is first created.
        # We grab the keys from settings (which came from your .env file)
        # and immediately load whatever tokens are saved on disk.

        self.app_key    = settings.schwab_app_key
        self.app_secret = settings.schwab_app_secret
        self.token_path = settings.schwab_token_path
        self._tokens    = self._load_tokens()  # load tokens.json right away


    # ── Token Management ──────────────────────────────────────────────────────
    #
    # These four methods handle the entire auth lifecycle automatically.
    # You never call these from outside this file — they're internal helpers.
    # The leading underscore (_) on the name is a Python convention meaning
    # "this is private, only used inside this class."

    def _load_tokens(self) -> dict:
        # Read tokens.json from disk and return it as a Python dictionary.
        # If the file doesn't exist yet (first run), return an empty dict
        # instead of crashing — the error will be caught later when we
        # try to make an actual API call.
        try:
            with open(self.token_path, "r") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}

    def _save_tokens(self, tokens: dict):
        # Write the current tokens back to disk.
        # We call this every time we get a new access token so it
        # survives a server restart — we never have to re-authenticate manually.
        with open(self.token_path, "w") as f:
            json.dump(tokens, f, indent=2)

    def _is_token_valid(self) -> bool:
        # Check whether the access token is still usable.
        # We compare the current time against the saved expiry timestamp.
        # The "- 60" gives us a 60-second buffer — we refresh slightly
        # before it expires rather than right at the edge, which avoids
        # race conditions where the token expires mid-request.
        expiry = self._tokens.get("expiry", 0)
        return time.time() < expiry - 60

    def _refresh_access_token(self):
        # Called automatically when the access token has expired.
        # Uses the refresh token to get a brand new access token from Schwab.
        # Access tokens last 30 minutes. Refresh tokens last 7 days.
        # This method runs silently in the background — no human action needed.

        refresh_token = self._tokens.get("refresh_token")
        if not refresh_token:
            # If there's no refresh token at all, the user needs to
            # go through the full OAuth login flow again (like they did in v1).
            raise Exception("No refresh token available. Re-authenticate.")

        # Schwab requires your app key and secret to be Base64 encoded
        # and sent as a "Basic" authorization header during token exchange.
        # This is standard OAuth2 — you're proving who your app is.
        creds = base64.b64encode(
            f"{self.app_key}:{self.app_secret}".encode()
        ).decode()

        response = httpx.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={
                "grant_type":    "refresh_token",
                "refresh_token": refresh_token,
            },
        )

        # raise_for_status() means: if Schwab returned an error code
        # (like 401 unauthorized or 500 server error), raise a Python
        # exception immediately instead of silently continuing with bad data.
        response.raise_for_status()
        data = response.json()

        # Update our tokens with the new values and save to disk.
        # time.time() gives the current time in seconds. We add however
        # many seconds Schwab says the token is valid for (usually 1800 = 30 min).
        self._tokens["access_token"] = data["access_token"]
        self._tokens["expiry"]       = time.time() + data.get("expires_in", 1800)

        # Schwab sometimes issues a new refresh token alongside the access token.
        # If it does, save that too — always use the latest one.
        if "refresh_token" in data:
            self._tokens["refresh_token"] = data["refresh_token"]

        self._save_tokens(self._tokens)

    def _get_headers(self) -> dict:
        # This is called before every single API request.
        # It checks if the token is still valid, refreshes if not,
        # then returns the authorization header the request needs.
        #
        # This is the method that makes auth completely invisible to the
        # rest of the app — every endpoint just calls _get_headers() and
        # never thinks about tokens at all.
        if not self._is_token_valid():
            self._refresh_access_token()
        return {"Authorization": f"Bearer {self._tokens['access_token']}"}


    # ── Account Methods ───────────────────────────────────────────────────────
    #
    # These are the public methods — the ones other files will actually call.
    # No leading underscore, because they're meant to be used from outside.

    def get_account_numbers(self) -> list:
        response = httpx.get(
            f"{TRADER_BASE}/accounts/accountNumbers",
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()

    def get_accounts(self) -> list:
        # Fetch all accounts linked to your Schwab login.
        # Returns a list — you have two accounts (Roth IRA and Brokerage)
        # so this will return a list of two objects.
        response = httpx.get(
            f"{TRADER_BASE}/accounts",
            headers=self._get_headers(),  # handles auth automatically
        )
        response.raise_for_status()
        return response.json()

    def get_portfolio(self, account_hash: str) -> dict:
        # Fetch full account details including open positions.
        # account_hash is Schwab's internal identifier for each account —
        # it's not your account number, it's a hashed version of it.
        # The ?fields=positions param tells Schwab to include position data.
        response = httpx.get(
            f"{TRADER_BASE}/accounts/{account_hash}",
            params={"fields": "positions"},
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()


    # ── Quote Methods ─────────────────────────────────────────────────────────

    def get_quote(self, symbol: str) -> dict:
        # Fetch a live quote for a single symbol like SPY or AAPL.
        # Even for one symbol, Schwab uses the same /quotes endpoint
        # as the multi-symbol version — it just takes one symbol in the param.
        response = httpx.get(
            f"{MARKET_BASE}/quotes",
            params={"symbols": symbol},
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()

    def get_quotes(self, symbols: list[str]) -> dict:
        # Fetch live quotes for multiple symbols at once.
        # Schwab expects them as a comma-separated string: "SPY,QQQ,AAPL"
        # so we join the list with commas before sending.
        response = httpx.get(
            f"{MARKET_BASE}/quotes",
            params={"symbols": ",".join(symbols)},
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()
    
    def get_price_history(
        self,
        symbol: str,
        period_type: str = "day",
        period: int = 1,
        frequency_type: str = "minute",
        frequency: int = 1,
        need_extended_hours_data: bool = True,
    ) -> dict:
        # Fetch OHLCV candle data for charting.
        # periodType controls the overall date range:
        #   "day"   → intraday, use frequencyType="minute"
        #   "month" → use frequencyType="daily"
        #   "year"  → use frequencyType="daily" or "weekly"
        #   "ytd"   → year to date, use frequencyType="daily"
        #
        # frequency controls the candle size:
        #   frequencyType="minute" → frequency can be 1, 2, 5, 10, 15, 30
        #   frequencyType="daily"  → frequency must be 1
        #   frequencyType="weekly" → frequency must be 1
        response = httpx.get(
            f"{MARKET_BASE}/pricehistory",
            params={
                "symbol":                 symbol,
                "periodType":             period_type,
                "period":                 period,
                "frequencyType":          frequency_type,
                "frequency":              frequency,
                "needExtendedHoursData":  str(need_extended_hours_data).lower(),
            },
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()

    def get_options_chain(
        self,
        symbol: str,
        contract_type: str = "ALL",
        strike_count: int = 20,
        include_underlying_quote: bool = True,
        strategy: str = "SINGLE",
        expiration_month: str = "ALL",
    ) -> dict:
        # Fetch the full options chain for a symbol including Greeks.
        # contractType: "CALL", "PUT", or "ALL"
        # strikeCount: number of strikes above/below ATM to return
        # strategy: "SINGLE" for standard chain, "ANALYTICAL" for Greeks
        response = httpx.get(
            f"{MARKET_BASE}/chains",
            params={
                "symbol":                  symbol,
                "contractType":            contract_type,
                "strikeCount":             strike_count,
                "includeUnderlyingQuote":  str(include_underlying_quote).lower(),
                "strategy":                strategy,
                "expMonth":                expiration_month,
            },
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()



    # ── Order Methods ─────────────────────────────────────────────────────────
    
    def get_orders(self, account_hash: str, days_back: int = 60) -> list:
        # Fetch all orders for a given account.
        # Schwab requires fromEnteredTime and toEnteredTime parameters.
        # Max allowed by Schwab is 60 days per request — chunk into 60-day windows.
        MAX_CHUNK = 60
        now = datetime.utcnow()
        all_orders: list = []
        remaining = days_back
        chunk_end = now
        seen_ids: set = set()
        while remaining > 0:
            chunk_days = min(remaining, MAX_CHUNK)
            chunk_start = chunk_end - timedelta(days=chunk_days)
            from_time = chunk_start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            to_time   = chunk_end.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            response = httpx.get(
                f"{TRADER_BASE}/accounts/{account_hash}/orders",
                params={
                    "fromEnteredTime": from_time,
                    "toEnteredTime":   to_time,
                    "maxResults":      250,
                },
                headers=self._get_headers(),
            )
            response.raise_for_status()
            chunk = response.json()
            if isinstance(chunk, list):
                for order in chunk:
                    oid = order.get("orderId")
                    if oid not in seen_ids:
                        seen_ids.add(oid)
                        all_orders.append(order)
            remaining -= chunk_days
            chunk_end = chunk_start
        return all_orders

    def place_order(self, account_hash: str, order: dict) -> dict:
        # Place any order by sending an order payload to Schwab.
        # The order dict is the full JSON structure Schwab expects.
        # Returns the response — including the order ID if successful.
        response = httpx.post(
            f"{TRADER_BASE}/accounts/{account_hash}/orders",
            headers={**self._get_headers(), "Content-Type": "application/json"},
            json=order,
        )
        response.raise_for_status()
        # Schwab returns 201 Created with no body on success.
        # The order ID is in the Location response header.
        location = response.headers.get("location", "")
        order_id = location.split("/")[-1] if location else None
        return {"order_id": order_id, "status": "placed"}

    def cancel_order(self, account_hash: str, order_id: str) -> dict:
        # Cancel an open order by its ID.
        response = httpx.delete(
            f"{TRADER_BASE}/accounts/{account_hash}/orders/{order_id}",
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return {"order_id": order_id, "status": "cancelled"}


# ── Shared Instance ───────────────────────────────────────────────────────────
#
# We create one instance of SchwabClient here at the bottom.
# Every other file that needs to talk to Schwab does:
#   from schwab.client import schwab
# They all share this same instance — nobody creates their own.
# This means tokens are loaded once and shared, not reloaded on every request.

schwab = SchwabClient()
