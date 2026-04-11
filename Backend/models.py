# models.py
# SQLAlchemy table definitions for AlphaDesk users and Schwab tokens

from sqlalchemy import Column, String, DateTime, Text, Boolean, Integer
from sqlalchemy.sql import func
from database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name     = Column(String, nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())


class SchwabToken(Base):
    __tablename__ = "schwab_tokens"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id       = Column(String, nullable=False, index=True)
    access_token  = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    expiry        = Column(Integer, nullable=True)   # Unix timestamp
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())


class JournalNote(Base):
    __tablename__ = "journal_notes"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, nullable=False, index=True)
    trade_id   = Column(String, nullable=False, index=True)   # "{entryOrderId}-{exitOrderId}"
    setup      = Column(String, nullable=True)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserSettings(Base):
    __tablename__ = "user_settings"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, nullable=False, unique=True, index=True)
    watchlist  = Column(Text, nullable=True)    # JSON string
    settings   = Column(Text, nullable=True)    # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
