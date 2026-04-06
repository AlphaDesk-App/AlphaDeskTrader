from fastapi import APIRouter, HTTPException
from schwab.client import schwab

router = APIRouter()

@router.get("/hashes")
async def get_account_hashes():
    try:
        return schwab.get_account_numbers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_accounts():
    try:
        return schwab.get_accounts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{account_hash}/portfolio")
async def get_portfolio(account_hash: str):
    try:
        return schwab.get_portfolio(account_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))