# routers/quotes.py
#
# Handles all quote-related endpoints.
#
# Endpoints:
#   GET /quotes/{symbol}                    → single live quote
#   GET /quotes/?symbols=SPY,QQQ            → multiple live quotes
#   GET /quotes/{symbol}/history            → OHLCV candles for charting

from fastapi import APIRouter, HTTPException, Query
from schwab.client import schwab

router = APIRouter()


@router.get("/{symbol}/history")
async def get_price_history(
    symbol: str,
    period_type: str = Query("day", description="day | month | year | ytd"),
    period: int = Query(1, description="Number of periods"),
    frequency_type: str = Query("minute", description="minute | daily | weekly | monthly"),
    frequency: int = Query(1, description="Frequency e.g. 1, 2, 5, 15, 30"),
    need_extended_hours: bool = Query(True, description="Include pre/after market"),
):
    # Returns OHLCV candle data for charting.
    # Schwab price history endpoint supports:
    #   periodType=day       → intraday (use frequencyType=minute)
    #   periodType=month     → daily candles over N months
    #   periodType=year      → daily/weekly candles over N years
    #   periodType=ytd       → year to date
    #
    # Examples:
    #   /quotes/SPY/history?period_type=day&period=1&frequency_type=minute&frequency=1   → 1-min candles today
    #   /quotes/SPY/history?period_type=day&period=1&frequency_type=minute&frequency=5   → 5-min candles today
    #   /quotes/SPY/history?period_type=month&period=1&frequency_type=daily&frequency=1  → daily candles 1 month
    try:
        return schwab.get_price_history(
            symbol=symbol.upper(),
            period_type=period_type,
            period=period,
            frequency_type=frequency_type,
            frequency=frequency,
            need_extended_hours_data=need_extended_hours,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/options")
async def get_options_chain(
    symbol: str,
    contract_type: str = Query("ALL", description="CALL | PUT | ALL"),
    strike_count: int = Query(20, description="Strikes above/below ATM"),
    expiration_month: str = Query("ALL", description="JAN-DEC or ALL"),
):
    try:
        return schwab.get_options_chain(
            symbol=symbol.upper(),
            contract_type=contract_type,
            strike_count=strike_count,
            expiration_month=expiration_month,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}")
async def get_quote(symbol: str):
    try:
        return schwab.get_quote(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_quotes(symbols: str = Query(..., description="Comma-separated symbols e.g. SPY,QQQ")):
    try:
        symbol_list = [s.strip().upper() for s in symbols.split(",")]
        return schwab.get_quotes(symbol_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
