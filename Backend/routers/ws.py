import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth_utils import decode_token
from schwab.client_db import get_schwab_client

router = APIRouter()


async def safe_send(websocket: WebSocket, data: dict) -> bool:
    # Returns False if the connection is closed so we can exit the loop cleanly.
    try:
        if websocket.client_state != WebSocketState.CONNECTED:
            return False
        await websocket.send_text(json.dumps(data))
        return True
    except (WebSocketDisconnect, RuntimeError, Exception):
        return False


async def get_user_id_from_ws(websocket: WebSocket, token: str) -> str | None:
    """Decode JWT from query param, return user_id or None."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    return payload.get("sub")


@router.websocket("/quotes/{symbol}")
async def stream_quote(
    websocket: WebSocket,
    symbol: str,
    token: str = Query(default=""),
):
    await websocket.accept()

    # Authenticate via JWT query param
    user_id = await get_user_id_from_ws(websocket, token)
    if not user_id:
        await safe_send(websocket, {"error": "Unauthorized: invalid or missing token"})
        await websocket.close(code=4001)
        return

    # Get a fresh DB session for this WebSocket connection
    async for db in get_db():
        try:
            client = await get_schwab_client(user_id, db)
        except Exception as e:
            await safe_send(websocket, {"error": str(e)})
            await websocket.close(code=4003)
            return

        try:
            while True:
                try:
                    data = await client.get_quote(symbol.upper())
                    if not await safe_send(websocket, data):
                        break
                except Exception as e:
                    if not await safe_send(websocket, {"error": str(e)}):
                        break
                await asyncio.sleep(2)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        break


@router.websocket("/portfolio/{account_hash}")
async def stream_portfolio(
    websocket: WebSocket,
    account_hash: str,
    token: str = Query(default=""),
):
    await websocket.accept()

    # Authenticate via JWT query param
    user_id = await get_user_id_from_ws(websocket, token)
    if not user_id:
        await safe_send(websocket, {"error": "Unauthorized: invalid or missing token"})
        await websocket.close(code=4001)
        return

    # Get a fresh DB session for this WebSocket connection
    async for db in get_db():
        try:
            client = await get_schwab_client(user_id, db)
        except Exception as e:
            await safe_send(websocket, {"error": str(e)})
            await websocket.close(code=4003)
            return

        try:
            while True:
                try:
                    data = await client.get_portfolio(account_hash)
                    if not await safe_send(websocket, data):
                        break
                except Exception as e:
                    if not await safe_send(websocket, {"error": str(e)}):
                        break
                await asyncio.sleep(2)
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        break
