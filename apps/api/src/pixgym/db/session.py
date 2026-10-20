import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import TextClause, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from pixgym.core.config import get_settings


def set_user_stmt(user_id: uuid.UUID) -> TextClause:
    """Ustawia użytkownika dla polityk RLS do końca bieżącej transakcji."""
    return text("SELECT set_config('app.user_id', :uid, true)").bindparams(uid=str(user_id))


@lru_cache
def get_engine() -> AsyncEngine:
    return create_async_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


@asynccontextmanager
async def user_session(user_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    """Transakcja widząca wyłącznie dane danego użytkownika (i dane wbudowane)."""
    async with get_sessionmaker()() as session, session.begin():
        await session.execute(set_user_stmt(user_id))
        yield session
