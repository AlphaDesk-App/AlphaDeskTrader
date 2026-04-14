from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth_deps import get_current_user
from models import User
from schwab.client_db import get_schwab_client

router = APIRouter()

@router.get("/{symbol}")
async def get_quote(symbol: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_quote(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_quotes(symbols: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_quotes(symbols.split(","))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{symbol}/history")
async def get_price_history(symbol: str, period_type: str = "day", period: int = 1,
    frequency_type: str = "minute", frequency: int = 5,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_price_history(symbol.upper(), period_type, period, frequency_type, frequency)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{symbol}/options")
async def get_options_chain(symbol: str, contract_type: str = "ALL", strike_count: int = 20,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_options_chain(symbol.upper(), contract_type, strike_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
