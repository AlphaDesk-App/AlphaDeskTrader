import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth_deps import get_current_user
from models import User
from schwab.client_db import get_schwab_client

router = APIRouter()


def _schwab_status(err: Exception) -> int:
    """Extract the HTTP status code from a 'Schwab NNN: ...' exception message, default 500."""
    m = re.match(r"Schwab (\d{3}):", str(err))
    return int(m.group(1)) if m else 500


class PlaceOrderRequest(BaseModel):
    account_hash: str
    order: dict


# NOTE: Specific routes must come before the wildcard /{account_hash} route
# so that POST /place and DELETE /cancel/... are matched first.

@router.post("/place")
async def place_order(body: PlaceOrderRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.place_order(body.account_hash, body.order)
    except Exception as e:
        raise HTTPException(status_code=_schwab_status(e), detail=str(e))


@router.delete("/cancel/{account_hash}/{order_id}")
async def cancel_order(account_hash: str, order_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.cancel_order(account_hash, order_id)
    except Exception as e:
        raise HTTPException(status_code=_schwab_status(e), detail=str(e))


@router.get("/{account_hash}")
async def get_orders(account_hash: str, days_back: int = 60, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        client = await get_schwab_client(current_user.id, db)
        return await client.get_orders(account_hash, days_back=days_back)
    except Exception as e:
        raise HTTPException(status_code=_schwab_status(e), detail=str(e))
