"""SSO dev stub (local-only fake login) — 2026-06-03 design.

The stub provisions + logs in by email via resolve_sso_user, skipping the OIDC
handshake. These tests pin the happy path, idempotency, and — most importantly —
that it is unreachable when the flag is off or in production.
"""

from sqlalchemy import func, select

from src.core.config import get_settings
from src.models.user import User
from src.repositories.user_repo import UserRepository

URL = "/api/v1/auth/sso/dev-login"


def _enable_stub(monkeypatch):
    monkeypatch.setattr(get_settings(), "sso_dev_stub", True)


async def test_dev_login_provisions_and_sets_session(client, monkeypatch):
    _enable_stub(monkeypatch)
    r = await client.post(URL, json={"email": "dev@example.com"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert "session_token" in r.headers.get("set-cookie", "")


async def test_dev_login_idempotent(client, session, monkeypatch):
    _enable_stub(monkeypatch)
    assert (await client.post(URL, json={"email": "dup@example.com"})).status_code == 200
    assert (await client.post(URL, json={"email": "dup@example.com"})).status_code == 200
    u = await UserRepository(session).get_by_email("dup@example.com")
    assert u is not None and u.sso_subject == "devstub:dup@example.com"
    n = (
        await session.execute(select(func.count()).select_from(User).where(User.email == "dup@example.com"))
    ).scalar_one()
    assert n == 1  # no duplicate account on re-login


async def test_dev_login_404_when_flag_off(client):
    # sso_dev_stub defaults False — endpoint must not exist
    assert (await client.post(URL, json={"email": "dev@example.com"})).status_code == 404


async def test_dev_login_404_in_production_even_with_flag(client, monkeypatch):
    # The critical guard: is_production vetoes the stub regardless of the flag.
    _enable_stub(monkeypatch)
    monkeypatch.setattr(get_settings(), "app_env", "production")
    assert (await client.post(URL, json={"email": "dev@example.com"})).status_code == 404


async def test_dev_login_rejects_disallowed_domain(client, monkeypatch):
    _enable_stub(monkeypatch)
    r = await client.post(URL, json={"email": "intruder@evil.com"})
    assert r.status_code == 403
