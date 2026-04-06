import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from schwab.client import schwab

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


@router.websocket("/quotes/{symbol}")
async def stream_quote(websocket: WebSocket, symbol: str):
    await websocket.accept()
    try:
        while True:
            try:
                data = schwab.get_quote(symbol.upper())
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
async def stream_portfolio(websocket: WebSocket, account_hash: str):
    await websocket.accept()
    try:
        while True:
            try:
                data = schwab.get_portfolio(account_hash)
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