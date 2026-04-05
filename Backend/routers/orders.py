# routers/orders.py
#
# Handles all order-related endpoints.
#
# Endpoints in this file:
#   GET    /orders/{account_hash}          → fetch all orders for an account
#   POST   /orders/place                   → place a simple equity order
#   POST   /orders/bracket                 → place a bracket order
#   DELETE /orders/cancel/{account_hash}/{order_id} → cancel an order

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from schwab.client import schwab

router = APIRouter()


# ── Request Models ─────────────────────────────────────────────────────────────
#
# Pydantic models define the shape of data coming IN to your endpoints.
# When a POST request arrives, FastAPI reads the JSON body and validates
# it against the model automatically. If a required field is missing or
# the wrong type, FastAPI rejects it before your code even runs.

class PlaceOrderRequest(BaseModel):
    account_hash: str   # which account to place the order in
    symbol: str         # e.g. "SPY"
    instruction: str    # "BUY" or "SELL"
    quantity: int       # number of shares
    order_type: str     # "LIMIT" or "MARKET"
    price: float = None # required for LIMIT orders, ignored for MARKET
    session: str = "NORMAL"
    duration: str = "DAY"


class BracketOrderRequest(BaseModel):
    account_hash: str
    symbol: str
    instruction: str    # "BUY" or "SELL"
    quantity: int
    entry_price: float  # your limit entry price
    take_profit: float  # price where you want to take profit
    stop_loss: float    # price where you want to cut the loss
    session: str = "NORMAL"
    duration: str = "DAY"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/{account_hash}")
async def get_orders(account_hash: str):
    # Fetch all orders for a given account.
    # account_hash comes from the URL path automatically.
    try:
        return schwab.get_orders(account_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/place")
async def place_order(req: PlaceOrderRequest):
    # Place a simple single-leg equity order.
    # FastAPI reads the JSON body and maps it to PlaceOrderRequest automatically.
    #
    # We build the order payload here in the format Schwab expects,
    # then pass it to the client which sends it to Schwab.
    try:
        order = {
            "orderType": req.order_type,
            "session": req.session,
            "duration": req.duration,
            "orderStrategyType": "SINGLE",
            "orderLegCollection": [
                {
                    "instruction": req.instruction,
                    "quantity": req.quantity,
                    "instrument": {
                        "symbol": req.symbol.upper(),
                        "assetType": "EQUITY",
                    },
                }
            ],
        }

        # Only include price for LIMIT orders.
        # MARKET orders don't have a price — Schwab will reject them if you send one.
        if req.order_type == "LIMIT" and req.price:
            order["price"] = str(req.price)

        return schwab.place_order(req.account_hash, order)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bracket")
async def place_bracket_order(req: BracketOrderRequest):
    # Place a bracket order — entry + take profit + stop loss as one order.
    #
    # Schwab handles this as a TRIGGER + OCO structure:
    #   TRIGGER  → the entry order. When it fills, it automatically triggers the OCO.
    #   OCO      → "One Cancels Other" — take profit and stop loss live together.
    #              When one fills, Schwab automatically cancels the other.
    #
    # This means you place one order and Schwab manages the exit automatically.
    # You don't have to watch the position and manually place stops.
    try:
        # Figure out the exit instruction — opposite of entry
        exit_instruction = "SELL" if req.instruction == "BUY" else "BUY"

        order = {
            "orderType": "LIMIT",
            "session": req.session,
            "duration": req.duration,
            "price": str(req.entry_price),
            "orderStrategyType": "TRIGGER",  # entry triggers the OCO on fill
            "orderLegCollection": [
                {
                    "instruction": req.instruction,
                    "quantity": req.quantity,
                    "instrument": {
                        "symbol": req.symbol.upper(),
                        "assetType": "EQUITY",
                    },
                }
            ],
            "childOrderStrategies": [
                {
                    "orderStrategyType": "OCO",  # one cancels other
                    "childOrderStrategies": [
                        {
                            # Take profit leg — limit order at your target price
                            "orderType": "LIMIT",
                            "session": req.session,
                            "duration": req.duration,
                            "price": str(req.take_profit),
                            "orderStrategyType": "SINGLE",
                            "orderLegCollection": [
                                {
                                    "instruction": exit_instruction,
                                    "quantity": req.quantity,
                                    "instrument": {
                                        "symbol": req.symbol.upper(),
                                        "assetType": "EQUITY",
                                    },
                                }
                            ],
                        },
                        {
                            # Stop loss leg — stop order at your risk price
                            "orderType": "STOP",
                            "session": req.session,
                            "duration": req.duration,
                            "stopPrice": str(req.stop_loss),
                            "orderStrategyType": "SINGLE",
                            "orderLegCollection": [
                                {
                                    "instruction": exit_instruction,
                                    "quantity": req.quantity,
                                    "instrument": {
                                        "symbol": req.symbol.upper(),
                                        "assetType": "EQUITY",
                                    },
                                }
                            ],
                        },
                    ],
                }
            ],
        }

        return schwab.place_order(req.account_hash, order)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cancel/{account_hash}/{order_id}")
async def cancel_order(account_hash: str, order_id: str):
    # Cancel an open order.
    # Both account_hash and order_id come from the URL path automatically.
    try:
        return schwab.cancel_order(account_hash, order_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))