import asyncio
import base64
import time
import logging
import httpx
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select
from config import settings
from routers import accounts, orders, quotes, ws, auth, journal
from database import init_db, AsyncSessionLocal
from models import SchwabToken

# Shared async client for token refresh background task
_async_client = httpx.AsyncClient(timeout=15.0)

# Path to the built frontend — Backend/../Frontend/dist
DIST_DIR = Path(__file__).parent.parent / "Frontend" / "dist"

logger = logging.getLogger(__name__)

TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token"
REFRESH_INTERVAL = 6 * 24 * 60 * 60   # 6 days in seconds
STARTUP_DELAY    = 5 * 60              # wait 5 min after boot before first sweep


async def _refresh_token(token: SchwabToken) -> bool:
    """Exchange one refresh token for a new access + refresh token. Returns True on success."""
    creds = base64.b64encode(
        f"{settings.schwab_app_key}:{settings.schwab_app_secret}".encode()
    ).decode()
    try:
        res = await _async_client.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "refresh_token", "refresh_token": token.refresh_token},
        )
        if res.status_code != 200:
            logger.warning("Schwab token refresh failed for user %s: %s", token.user_id, res.text)
            return False
        data = res.json()
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SchwabToken).where(SchwabToken.id == token.id))
            t = result.scalar_one_or_none()
            if t:
                t.access_token  = data["access_token"]
                t.expiry        = int(time.time()) + data.get("expires_in", 1800)
                if "refresh_token" in data:
                    t.refresh_token = data["refresh_token"]
                await db.commit()
        logger.info("Schwab token refreshed for user %s", token.user_id)
        return True
    except Exception as e:
        logger.error("Token refresh error for user %s: %s", token.user_id, e)
        return False


async def token_refresh_loop():
    """Background task: refresh all Schwab tokens on startup and every 6 days."""
    await asyncio.sleep(STARTUP_DELAY)   # let the server fully boot first
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(SchwabToken))
                tokens = result.scalars().all()
            logger.info("Running scheduled Schwab token refresh for %d user(s)", len(tokens))
            for token in tokens:
                await _refresh_token(token)
        except Exception as e:
            logger.error("Token refresh loop error: %s", e)
        await asyncio.sleep(REFRESH_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(token_refresh_loop())
    yield


app = FastAPI(title="AlphaDesk V2 API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "app://.",
        "https://alphadesktrader.onrender.com",
        "https://alphadesktrader-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/auth",     tags=["auth"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(quotes.router,   prefix="/quotes",   tags=["quotes"])
app.include_router(orders.router,   prefix="/orders",   tags=["orders"])
app.include_router(ws.router,       prefix="/ws",       tags=["websockets"])
app.include_router(journal.router,  prefix="/journal",  tags=["journal"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Serve frontend static files ───────────────────────────────────────────────
# Mount the compiled assets directory so JS/CSS bundles load correctly,
# then catch every other path and return index.html so React Router works.
#
# IMPORTANT: the catch-all must never serve HTML for API-like paths — that
# would cause the frontend to receive <!doctype html> where it expects JSON,
# producing a cryptic "Unexpected token '<'" parse error.
_API_PREFIXES = (
    "auth/", "accounts/", "quotes/", "orders/",
    "ws/", "journal/", "health",
)

if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Return index.html for SPA routes; JSON 404 for unmatched API paths."""
        # If the path looks like an API call that slipped through, return JSON 404
        # instead of HTML — prevents the cryptic parse error on the frontend.
        if any(full_path == p.rstrip("/") or full_path.startswith(p) for p in _API_PREFIXES):
            raise HTTPException(status_code=404, detail=f"API route not found: /{full_path}")
        index = DIST_DIR / "index.html"
        if not index.exists():
            raise HTTPException(status_code=404, detail="Frontend not built")
        return FileResponse(str(index))