"""admin tier + bootstrap (附录 L): first registrant = admin+pm; admin-only role management."""

from sqlalchemy import select

from src.models.user import User


async def test_first_registrant_is_admin_pm(client):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "first@example.com", "display_name": "F", "password": "pw12345678"},
    )
    l1 = await client.post(
        "/api/v1/auth/login", json={"email": "first@example.com", "password": "pw12345678"}
    )
    assert l1.json()["is_admin"] is True and l1.json()["is_pm"] is True

    await client.post(
        "/api/v1/auth/register",
        json={"email": "second@example.com", "display_name": "S", "password": "pw12345678"},
    )
    l2 = await client.post(
        "/api/v1/auth/login", json={"email": "second@example.com", "password": "pw12345678"}
    )
    assert l2.json()["is_admin"] is False and l2.json()["is_pm"] is False


async def test_admin_manage_roles(auth_client, session):
    alice = (await session.execute(select(User).where(User.email == "alice@example.com"))).scalar_one()
    assert alice.is_admin and alice.is_pm  # first registrant bootstrapped

    bob = User(tenant_id=alice.tenant_id, email="bob@example.com", display_name="Bob")
    session.add(bob)
    await session.flush()

    items = (await auth_client.get("/api/v1/admin/users")).json()["items"]
    assert any(u["email"] == "bob@example.com" and u["is_pm"] is False for u in items)

    r = await auth_client.patch(f"/api/v1/admin/users/{bob.id}", json={"is_pm": True})
    assert r.status_code == 200 and r.json()["is_pm"] is True

    # cannot unset the last admin (alice is the only admin)
    r2 = await auth_client.patch(f"/api/v1/admin/users/{alice.id}", json={"is_admin": False})
    assert r2.status_code == 422


async def test_admin_endpoints_require_admin(client):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "first@example.com", "display_name": "F", "password": "pw12345678"},
    )
    await client.post(
        "/api/v1/auth/register",
        json={"email": "second@example.com", "display_name": "S", "password": "pw12345678"},
    )
    # log in as the non-admin second user
    await client.post(
        "/api/v1/auth/login", json={"email": "second@example.com", "password": "pw12345678"}
    )
    assert (await client.get("/api/v1/admin/users")).status_code == 403
