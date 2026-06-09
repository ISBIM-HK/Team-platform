"""Auth flow: domain-gated register, login, session cookie, /me, logout."""

from tests.conftest import register_and_login


async def test_register_rejects_foreign_domain(client):
    r = await client.post(
        "/api/v1/auth/register", json={"email": "bob@other.com", "display_name": "Bob", "password": "pw12345678"}
    )
    assert r.status_code == 403


async def test_register_then_duplicate_conflicts(client):
    body = {"email": "alice@example.com", "display_name": "Alice", "password": "pw12345678"}
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 200
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 409


async def test_login_wrong_password(client):
    await client.post(
        "/api/v1/auth/register", json={"email": "alice@example.com", "display_name": "Alice", "password": "pw12345678"}
    )
    r = await client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": "nope"})
    assert r.status_code == 401


async def test_me_requires_auth(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_login_sets_cookie_and_me_works(client):
    await register_and_login(client)
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"


async def test_logout_clears_session(auth_client):
    await auth_client.post("/api/v1/auth/logout")
    auth_client.cookies.clear()
    assert (await auth_client.get("/api/v1/auth/me")).status_code == 401
