# routers/auth.py
# Handles user registration, login, and Schwab OAuth flow

import base64
import httpx
import time
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
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


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:     EmailStr
    password:  str
    full_name: str = ""

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email)
    return {
        "token":      token,
        "user_id":    user.id,
        "email":      user.email,
        "full_name":  user.full_name,
        "schwab_connected": False,
    }


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Check if Schwab is connected
    token_result = await db.execute(
        select(SchwabToken).where(SchwabToken.user_id == user.id)
    )
    schwab_token = token_result.scalar_one_or_none()
    schwab_connected = schwab_token is not None and schwab_token.refresh_token is not None

    jwt_token = create_access_token(user.id, user.email)
    return {
        "token":            jwt_token,
        "user_id":          user.id,
        "email":            user.email,
        "full_name":        user.full_name,
        "schwab_connected": schwab_connected,
    }


# ── Schwab OAuth — Step 1: Redirect to Schwab ─────────────────────────────────

@router.get("/schwab/connect")
async def schwab_connect(current_user: User = Depends(get_current_user)):
    # Build the Schwab OAuth authorization URL
    # The state parameter carries the user_id so we know who to save tokens for
    params = (
        f"?response_type=code"
        f"&client_id={settings.schwab_app_key}"
        f"&redirect_uri={settings.schwab_redirect_uri}"
        f"&state={current_user.id}"
    )
    return {"auth_url": AUTH_URL + params}


# ── Schwab OAuth — Step 2: Handle callback ────────────────────────────────────

@router.get("/schwab/callback")
async def schwab_callback(
    code:  str,
    state: str,   # This is the user_id we passed in step 1
    db:    AsyncSession = Depends(get_db),
):
    # Exchange the authorization code for tokens
    creds = base64.b64encode(
        f"{settings.schwab_app_key}:{settings.schwab_app_secret}".encode()
    ).decode()

    response = httpx.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type":  "application/x-www-form-urlencoded",
        },
        data={
            "grant_type":   "authorization_code",
            "code":         code,
            "redirect_uri": settings.schwab_redirect_uri,
        },
    )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange Schwab auth code")

    data = response.json()

    # Save or update tokens for this user
    result = await db.execute(
        select(SchwabToken).where(SchwabToken.user_id == state)
    )
    existing = result.scalar_one_or_none()

    expiry = int(time.time()) + data.get("expires_in", 1800)

    if existing:
        existing.access_token  = data["access_token"]
        existing.refresh_token = data.get("refresh_token", existing.refresh_token)
        existing.expiry        = expiry
    else:
        db.add(SchwabToken(
            user_id=state,
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token"),
            expiry=expiry,
        ))

    await db.commit()

    # Redirect to the frontend after successful connection
    return RedirectResponse(url="http://localhost:5173/connect-schwab?status=success")


# ── Get current user info ─────────────────────────────────────────────────────

@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token_result = await db.execute(
        select(SchwabToken).where(SchwabToken.user_id == current_user.id)
    )
    schwab_token = token_result.scalar_one_or_none()
    schwab_connected = schwab_token is not None and schwab_token.refresh_token is not None

    return {
        "user_id":          current_user.id,
        "email":            current_user.email,
        "full_name":        current_user.full_name,
        "schwab_connected": schwab_connected,
        "created_at":       current_user.created_at,
    }


# ── Disconnect Schwab ─────────────────────────────────────────────────────────

@router.delete("/schwab/disconnect")
async def schwab_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SchwabToken).where(SchwabToken.user_id == current_user.id)
    )
    token = result.scalar_one_or_none()
    if token:
        await db.delete(token)
        await db.commit()
    return {"message": "Schwab account disconnected"}
