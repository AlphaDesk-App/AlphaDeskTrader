from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth_deps import get_current_user
from models import User
from schwab.client_db import get_schwab_client

router = APIRouter()

class PlaceOrderRequest(BaseModel):
    account_hash: str
    order: dict

@router.get("/{account_hash}")
async def get_orders(account_hash: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_orders(account_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/place")
async def place_order(body: PlaceOrderRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.place_order(body.account_hash, body.order)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cancel/{account_hash}/{order_id}")
async def cancel_order(account_hash: str, order_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.cancel_order(account_hash, order_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
