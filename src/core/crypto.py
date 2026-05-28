"""Credential encryption (Fernet) for integration tokens.

Third-party tokens (e.g. GitLab PAT) are stored encrypted in
integrations.credential; the master key CRYPTO_KEY lives in env only.
"""

from __future__ import annotations

import json

from cryptography.fernet import Fernet

from src.core.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().crypto_key
    if not key:
        raise RuntimeError("CRYPTO_KEY is not set — cannot encrypt/decrypt credentials")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_credential(data: dict) -> dict:
    """Encrypt a credential dict → {"enc": "<token>"} for JSONB storage."""
    token = _fernet().encrypt(json.dumps(data).encode()).decode()
    return {"enc": token}


def decrypt_credential(stored: dict) -> dict:
    """Reverse encrypt_credential."""
    return json.loads(_fernet().decrypt(stored["enc"].encode()).decode())
