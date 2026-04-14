import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from database import AsyncSessionLocal
from auth_utils import decode_token
from schwab.client_db import get_schwab_client

router = APIRouter()


async def safe_send(websocket: WebSocket, data: dict) -> bool:
    """Returns False if the connection is closed so the polling loop can exit."""
    try:
        if websocket.client_state != WebSocketState.CONNECTED:
            return False
        await websocket.send_text(json.dumps(data))
        return True
    except (WebSocketDisconnect, RuntimeError, Exception):
        return False


async def _get_schwab_for_ws(websocket: WebSocket, token: str):
    """
    Authenticate the WebSocket via JWT, load the Schwab client from DB,
    then IMMEDIATELY close the DB session.  The client keeps token values
    in memory; SchwabClientDB._refresh() opens its own session when needed.
    Returns (client, None) on success, or (None, error_str) on failure.
    """
    if not token:
        return None, "Unauthorized: missing token"

    payload = decode_token(token)
    if not payload:
        return None, "Unauthorized: invalid or expired token"

    user_id = payload.get("sub")
    if not user_id:
        return None, "Unauthorized: bad token payload"

    # Short-lived DB session — only used for the initial token fetch
    async with AsyncSessionLocal() as db:
        try:
            client = await get_schwab_client(user_id, db)
            # Detach so the session can close cleanly
            db.expunge_all()
        except Exception as e:
            return None, str(e)

    # DB session is now closed; client holds tokens in memory
    return client, None


@router.websocket("/quotes/{symbol}")
async def stream_quote(
    websocket: WebSocket,
    symbol: str,
    token: str = Query(default=""),
):
    await websocket.accept()

    client, err = await _get_schwab_for_ws(websocket, token)
    if err:
        await safe_send(websocket, {"error": err})
        await websocket.close(code=4001)
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


@router.websocket("/portfolio/{account_hash}")
async def stream_portfolio(
    websocket: WebSocket,
    account_hash: str,
    token: str = Query(default=""),
):
    await websocket.accept()

    client, err = await _get_schwab_for_ws(websocket, token)
    if err:
        await safe_send(websocket, {"error": err})
        await websocket.close(code=4001)
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
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
