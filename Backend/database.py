from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,        # up from default 5
    max_overflow=20,     # up from default 10
    pool_pre_ping=True,  # drop stale connections after cold start
    pool_recycle=300,    # recycle connections every 5 min
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)