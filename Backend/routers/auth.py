# routers/auth.py
import base64
import httpx
import time

# Shared async client for OAuth token exchange
_async_client = httpx.AsyncClient(timeout=15.0)
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, SchwabToken
from auth_utils import hash_password, verify_password, create_access_token
from auth_deps import get_current_user
from config import settings

router = APIRouter()

TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token"
AUTH_URL  = "https://api.schwabapi.com/v1/oauth/authorize"


class RegisterRequest(BaseModel):
    email:     EmailStr
    password:  str
    full_name: str = ""

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


async def get_schwab_status(user_id: str, db: AsyncSession) -> bool:
    result = await db.execute(select(SchwabToken).where(SchwabToken.user_id == user_id))
    token = result.scalar_one_or_none()
    return token is not None and bool(token.refresh_token)


@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(email=body.email, password_hash=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "token":            create_access_token(user.id, user.email),
        "user_id":          user.id,
        "email":            user.email,
        "full_name":        user.full_name,
        "schwab_connected": False,
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    schwab_connected = await get_schwab_status(user.id, db)

    return {
        "token":            create_access_token(user.id, user.email),
        "user_id":          user.id,
        "email":            user.email,
        "full_name":        user.full_name,
        "schwab_connected": schwab_connected,
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    schwab_connected = await get_schwab_status(current_user.id, db)
    return {
        "user_id":          current_user.id,
        "email":            current_user.email,
        "full_name":        current_user.full_name,
        "schwab_connected": schwab_connected,
        "created_at":       current_user.created_at,
    }


@router.get("/schwab/connect")
async def schwab_connect(current_user: User = Depends(get_current_user)):
    params = (
        f"?response_type=code"
        f"&client_id={settings.schwab_app_key}"
        f"&redirect_uri={settings.schwab_redirect_uri}"
        f"&state={current_user.id}"
    )
    return {"auth_url": AUTH_URL + params}


@router.get("/schwab/callback")
async def schwab_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    creds = base64.b64encode(f"{settings.schwab_app_key}:{settings.schwab_app_secret}".encode()).decode()

    response = await _async_client.post(
        TOKEN_URL,
        headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "authorization_code", "code": code, "redirect_uri": settings.schwab_redirect_uri},
    )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Schwab token exchange failed: {response.text}")

    data     = response.json()
    expiry   = int(time.time()) + data.get("expires_in", 1800)
    user_id  = state  # state = user_id we passed in connect step

    result   = await db.execute(select(SchwabToken).where(SchwabToken.user_id == user_id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.access_token  = data["access_token"]
        existing.refresh_token = data.get("refresh_token", existing.refresh_token)
        existing.expiry        = expiry
    else:
        db.add(SchwabToken(
            user_id=user_id,
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token"),
            expiry=expiry,
        ))

    await db.commit()
    return {"status": "connected", "message": "Schwab account connected successfully"}


@router.delete("/schwab/disconnect")
async def schwab_disconnect(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SchwabToken).where(SchwabToken.user_id == current_user.id))
    token = result.scalar_one_or_none()
    if token:
        await db.delete(token)
        await db.commit()
    return {"message": "Schwab account disconnected"}
