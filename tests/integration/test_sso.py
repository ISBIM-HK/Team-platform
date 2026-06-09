"""SSO / generic OIDC (附录 M).

The OIDC handshake (discovery / token exchange / JWKS) needs a real IdP and is
manual/后续. Here we cover the parts that don't: resolve_sso_user's DB logic and
the callback guard paths (state mismatch / token failure → no session).
"""

import pytest

from src.api.routes.sso import resolve_sso_user
from src.core.config import get_settings
from src.models.tenant import Tenant
from src.models.user import User
from src.repositories.project_repo import ProjectRepository


async def _seed_user(session, email, *, sub=None, password=True):
    t = Tenant(name=get_settings().default_tenant_name)
    session.add(t)
    await session.flush()
    u = User(
        tenant_id=t.id,
        email=email,
        display_name="Seed",
        password_hash="hashed" if password else None,
        sso_subject=sub,
    )
    session.add(u)
    await session.flush()
    return u


def _enable_sso(monkeypatch):
    s = get_settings()
    for k, v in {
        "oidc_issuer": "https://idp.example.com",
        "oidc_client_id": "cid",
        "oidc_client_secret": "secret",
        "oidc_redirect_uri": "https://app.example.com/api/v1/auth/sso/callback",
    }.items():
        monkeypatch.setattr(s, k, v)
    assert s.sso_enabled


# ─── status / disabled gating ───
async def test_sso_status_disabled(client):
    r = await client.get("/api/v1/auth/sso/status")
    assert r.status_code == 200 and r.json()["enabled"] is False


async def test_sso_login_404_when_disabled(client):
    assert (await client.get("/api/v1/auth/sso/login")).status_code == 404


# ─── resolve_sso_user (附录 M §2) ───
async def test_auto_provision_first_user_is_admin(session):
    u = await resolve_sso_user(session, sub="sub-new", email="newbie@example.com", name="Newbie")
    assert u.sso_subject == "sub-new"
    assert u.password_hash is None  # SSO-only account
    assert u.is_admin and u.is_pm  # first user in the tenant
    inbox = await ProjectRepository(session).get_inbox(u.tenant_id, u.id)
    assert inbox is not None  # per-user Inbox created


async def test_links_existing_email_account(session):
    existing = await _seed_user(session, "alice@example.com", password=True)
    got = await resolve_sso_user(session, sub="sub-link", email="alice@example.com", name="Alice")
    assert got.id == existing.id
    assert got.sso_subject == "sub-link"  # linked
    assert got.password_hash is not None  # password login preserved


async def test_resolve_by_subject_is_idempotent(session):
    u1 = await resolve_sso_user(session, sub="sub-x", email="x@example.com", name="X")
    # second call with the same sub matches by subject; a different email is ignored
    u2 = await resolve_sso_user(session, sub="sub-x", email="different@example.com", name="Y")
    assert u1.id == u2.id


async def test_domain_not_allowed_is_rejected(session):
    with pytest.raises(PermissionError):
        await resolve_sso_user(session, sub="s", email="intruder@evil.com", name="B")


# ─── callback guard paths (no network) ───
async def test_callback_state_mismatch_no_session(client, monkeypatch):
    _enable_sso(monkeypatch)
    r = await client.get("/api/v1/auth/sso/callback?code=x&state=bad")
    assert r.status_code == 302
    assert "sso_error=state" in r.headers["location"]
    assert "session_token" not in r.headers.get("set-cookie", "")


async def test_callback_token_failure_no_session(client, monkeypatch):
    _enable_sso(monkeypatch)
    client.cookies.set("sso_state", "good")

    async def boom(code):
        raise RuntimeError("idp unreachable")

    monkeypatch.setattr("src.api.routes.sso.oidc.exchange_code", boom)
    r = await client.get("/api/v1/auth/sso/callback?code=x&state=good")
    assert r.status_code == 302
    assert "sso_error=token" in r.headers["location"]
    assert "session_token" not in r.headers.get("set-cookie", "")
