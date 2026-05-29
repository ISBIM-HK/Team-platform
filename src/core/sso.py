"""Generic OIDC client helpers (附录 M).

Network + crypto for the OIDC authorization-code flow: discovery, authorize-URL
build, token exchange, and id_token verification (JWKS signature + iss/aud/exp +
nonce). The DB mapping (resolve_sso_user) lives in the route and is unit-testable
without any of this.
"""

from urllib.parse import urlencode

import httpx
from authlib.jose import JsonWebKey, jwt

from src.core.config import get_settings

OIDC_SCOPE = "openid email profile"
_TIMEOUT = 10.0


async def _discover() -> dict:
    """Fetch the IdP's OIDC discovery document."""
    base = get_settings().oidc_issuer.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.get(f"{base}/.well-known/openid-configuration")
        r.raise_for_status()
        return r.json()


async def build_authorize_url(state: str, nonce: str) -> str:
    settings = get_settings()
    meta = await _discover()
    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "response_type": "code",
        "scope": OIDC_SCOPE,
        "state": state,
        "nonce": nonce,
    }
    return f"{meta['authorization_endpoint']}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    settings = get_settings()
    meta = await _discover()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.oidc_redirect_uri,
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.post(meta["token_endpoint"], data=data)
        r.raise_for_status()
        return r.json()


async def verify_id_token(id_token: str, nonce: str) -> dict:
    """Verify the id_token's signature + standard claims + nonce; return claims."""
    settings = get_settings()
    meta = await _discover()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.get(meta["jwks_uri"])
        r.raise_for_status()
        jwks = r.json()
    claims = jwt.decode(
        id_token,
        JsonWebKey.import_key_set(jwks),
        claims_options={
            "iss": {"essential": True, "value": meta["issuer"]},
            "aud": {"essential": True, "value": settings.oidc_client_id},
        },
    )
    claims.validate()  # exp / iat / nbf
    if claims.get("nonce") != nonce:
        raise ValueError("nonce mismatch")
    return dict(claims)
