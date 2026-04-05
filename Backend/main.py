from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routers import accounts, orders, quotes, ws, auth
from database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AlphaDesk V2 API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "app://."],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/auth",     tags=["auth"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(quotes.router,   prefix="/quotes",   tags=["quotes"])
app.include_router(orders.router,   prefix="/orders",   tags=["orders"])
app.include_router(ws.router,       prefix="/ws",       tags=["websockets"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
