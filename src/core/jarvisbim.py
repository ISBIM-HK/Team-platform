"""JarvisBIM proxy authentication — verify credentials against jarvisbim.com.cn."""

import hashlib
import uuid

import httpx

JARVISBIM_LOGIN_URL = "https://isbim.jarvisbim.com.cn/api/public/login-v1"
_TIMEOUT = 15


def _build_login_payload(email: str, password: str) -> dict:
    rang_string = uuid.uuid4().hex
    timestamp = str(int(__import__("time").time() * 1000))
    password_md5 = hashlib.md5(password.encode()).hexdigest()
    signature_input = email + password_md5 + rang_string + timestamp
    signature = hashlib.md5(signature_input.encode()).hexdigest()
    return {
        "loginName": email,
        "signature": signature,
        "timestamp": timestamp,
        "rangString": rang_string,
        "verificationKey": None,
    }


async def verify_credentials(email: str, password: str) -> dict | None:
    """Call JarvisBIM login API. Returns response body on success, None on failure."""
    payload = _build_login_payload(email, password)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(JARVISBIM_LOGIN_URL, json=payload)
    if resp.status_code != 200:
        return None
    body = resp.json()
    if not body.get("success"):
        return None
    return body.get("data") or body
