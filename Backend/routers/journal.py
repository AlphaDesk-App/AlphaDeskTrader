from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from auth_deps import get_current_user
from models import User, JournalNote
import uuid

router = APIRouter()


class NoteUpsert(BaseModel):
    trade_id: str
    setup: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
async def get_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all journal notes for the current user as a dict keyed by trade_id."""
    result = await db.execute(
        select(JournalNote).where(JournalNote.user_id == current_user.id)
    )
    rows = result.scalars().all()
    return {r.trade_id: {"setup": r.setup or "", "notes": r.notes or ""} for r in rows}


@router.put("/")
async def upsert_note(
    body: NoteUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a note for a specific trade_id."""
    result = await db.execute(
        select(JournalNote).where(
            JournalNote.user_id == current_user.id,
            JournalNote.trade_id == body.trade_id,
        )
    )
    note = result.scalar_one_or_none()

    if note:
        note.setup = body.setup or ""
        note.notes = body.notes or ""
    else:
        note = JournalNote(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            trade_id=body.trade_id,
            setup=body.setup or "",
            notes=body.notes or "",
        )
        db.add(note)

    await db.commit()
    return {"trade_id": body.trade_id, "setup": note.setup, "notes": note.notes}
