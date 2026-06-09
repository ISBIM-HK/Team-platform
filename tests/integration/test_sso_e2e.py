"""End-to-end OIDC handshake against an in-process IdP (附录 M).

Real RSA-signed id_token + real JWKS + real signature verification, routed to a
Starlette "IdP" via ASGITransport (no network, no browser). Exercises every leg
that is OUR code: discovery → exchange_code → verify_id_token (JWKS signature +
iss/aud/exp/nonce) → resolve_sso_user → session cookie. The only leg this can't
cover is the IdP's own login UI — that needs a real IdP + browser (manual).
"""

import time

import httpx
from authlib.jose import JsonWebKey, jwt
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from src.core.config import get_settings

ISSUER = "https://idp.test"
CLIENT_ID = "teamplat"
NONCE = "nonce-abc"
_KEY = JsonWebKey.generate_key("RSA", 2048, options={"kid": "test-key"}, is_private=True)


def _make_idp(*, sub="oidc-sub-1", email="ssotester@example.com", name="SSO Tester", nonce=NONCE, sign_key=_KEY):
    """A minimal OIDC IdP: discovery + JWKS (public _KEY) + token (signs an id_token)."""

    async def discovery(request):
        return JSONResponse(
            {
                "issuer": ISSUER,
                "authorization_endpoint": f"{ISSUER}/auth",
                "token_endpoint": f"{ISSUER}/token",
                "jwks_uri": f"{ISSUER}/jwks",
            }
        )

    async def jwks(request):
        return JSONResponse({"keys": [_KEY.as_dict(is_private=False)]})

    async def token(request):
        await request.form()
        now = int(time.time())
        payload = {
            "iss": ISSUER,
            "aud": CLIENT_ID,
            "sub": sub,
            "email": email,
            "name": name,
            "nonce": nonce,
            "iat": now,
            "exp": now + 300,
        }
        id_token = jwt.encode({"alg": "RS256", "kid": "test-key"}, payload, sign_key).decode()
        return JSONResponse({"id_token": id_token, "access_token": "at", "token_type": "Bearer"})

    return Starlette(
        routes=[
            Route("/.well-known/openid-configuration", discovery),
            Route("/jwks", jwks),
            Route("/token", token, methods=["POST"]),
        ]
    )


def _wire(monkeypatch, idp_app):
    s = get_settings()
    monkeypatch.setattr(s, "oidc_issuer", ISSUER)
    monkeypatch.setattr(s, "oidc_client_id", CLIENT_ID)
    monkeypatch.setattr(s, "oidc_client_secret", "shh")
    monkeypatch.setattr(s, "oidc_redirect_uri", "http://localhost:3137/api/v1/auth/sso/callback")
    transport = httpx.ASGITransport(app=idp_app)
    monkeypatch.setattr("src.core.sso._http_client", lambda: httpx.AsyncClient(transport=transport, timeout=5))


async def test_full_handshake_provisions_and_sets_session(client, monkeypatch):
    _wire(monkeypatch, _make_idp())
    client.cookies.set("sso_state", "st")
    client.cookies.set("sso_nonce", NONCE)
    r = await client.get("/api/v1/auth/sso/callback?code=realcode&state=st")
    assert r.status_code == 302 and r.headers["location"] == "/"
    assert "session_token=" in r.headers.get("set-cookie", "")
    # the session cookie works and the user was auto-provisioned from verified claims
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "ssotester@example.com"


async def test_handshake_rejects_bad_signature(client, monkeypatch):
    # IdP signs with a key NOT in its published JWKS → signature verification must fail
    rogue = JsonWebKey.generate_key("RSA", 2048, options={"kid": "test-key"}, is_private=True)
    _wire(monkeypatch, _make_idp(sign_key=rogue))
    client.cookies.set("sso_state", "st")
    client.cookies.set("sso_nonce", NONCE)
    r = await client.get("/api/v1/auth/sso/callback?code=x&state=st")
    assert r.status_code == 302 and "sso_error=token" in r.headers["location"]
    assert "session_token=" not in r.headers.get("set-cookie", "")


async def test_handshake_rejects_nonce_mismatch(client, monkeypatch):
    _wire(monkeypatch, _make_idp(nonce="attacker-nonce"))
    client.cookies.set("sso_state", "st")
    client.cookies.set("sso_nonce", NONCE)
    r = await client.get("/api/v1/auth/sso/callback?code=x&state=st")
    assert r.status_code == 302 and "sso_error=token" in r.headers["location"]
    assert "session_token=" not in r.headers.get("set-cookie", "")
