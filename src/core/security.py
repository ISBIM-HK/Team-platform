"""Password hashing + session token management.

- bcrypt for password hashing
- itsdangerous for signed session cookies
"""

import bcrypt
from itsdangerous import BadSignature, URLSafeTimedSerializer

from src.core.config import get_settings

SESSION_MAX_AGE_DAYS = 7


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _get_serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.secret_key)


def create_session_token(user_id: str) -> str:
    """Create a signed session token containing the user_id."""
    return _get_serializer().dumps(user_id)


def read_session_token(token: str) -> str | None:
    """Validate and extract user_id from session token. Returns None if invalid/expired."""
    try:
        user_id = _get_serializer().loads(
            token,
            max_age=SESSION_MAX_AGE_DAYS * 86400,
        )
        return user_id
    except BadSignature:
        return None
