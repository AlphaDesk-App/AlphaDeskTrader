from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth_deps import get_current_user
from models import User
from schwab.client_db import get_schwab_client

router = APIRouter()

@router.get("/hashes")
async def get_account_hashes(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_account_numbers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_accounts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_accounts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{account_hash}/portfolio")
async def get_portfolio(account_hash: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_portfolio(account_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
