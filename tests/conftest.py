"""Test harness.

Integration tests run against a dedicated `teamplat_test` database (never the
dev DB). Schema is built once from the SQLModel metadata; each test runs inside
a connection-bound transaction that is rolled back on teardown, so tests stay
isolated without truncating. A fresh async engine per test avoids asyncpg's
"future attached to a different loop" issue under function-scoped event loops.
"""

import os

# Settings are read (and cached) at import time, so the env must be set before
# importing anything under src.*
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://app:devpassword@localhost:5432/teamplat_test")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql+psycopg2://app:devpassword@localhost:5432/teamplat_test")
os.environ.setdefault("ALLOWED_EMAIL_DOMAINS", "example.com")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("APP_ENV", "development")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from src.api.app import app  # noqa: E402 — imports all models, populating metadata
from src.api.deps import get_db  # noqa: E402

TEST_DB_URL = os.environ["DATABASE_URL"]

# Build the schema once per session (sync, at import time — no event loop needed).
_sync_engine = create_engine(os.environ["DATABASE_URL_SYNC"])
SQLModel.metadata.drop_all(_sync_engine)
SQLModel.metadata.create_all(_sync_engine)
_sync_engine.dispose()


@pytest_asyncio.fixture
async def session():
    """A session whose writes all roll back after the test."""
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        trans = await conn.begin()
        s = AsyncSession(bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
        try:
            yield s
        finally:
            await s.close()
            await trans.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(session):
    """httpx client wired to the app, sharing the rolled-back test session."""
    async def _override_get_db():
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def register_and_login(client, email="alice@example.com", name="Alice", password="pw12345678"):
    await client.post("/api/v1/auth/register",
                      json={"email": email, "display_name": name, "password": password})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest_asyncio.fixture
async def auth_client(client):
    """A client with a registered + logged-in user (session cookie set)."""
    await register_and_login(client)
    return client
