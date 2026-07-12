"""
JWT issuing/verification. Per PRD section 11: tokens carry tenant_id and
quota_tier so downstream middleware never has to hit Postgres just to know
who's asking — only the tenant-manager stage does a DB lookup, and only to
confirm the tenant is still active and pull live quota overrides.
"""
from datetime import datetime, timedelta, timezone

import jwt
from pydantic import BaseModel

from app.config import settings


class TokenPayload(BaseModel):
    sub: str          # subject = API key id or user id that requested the token
    tenant_id: str
    quota_tier: str
    exp: int
    iss: str


class AuthError(Exception):
    """Raised on any invalid/expired/malformed token. Caught in middleware/auth.py."""


def create_access_token(*, subject: str, tenant_id: str, quota_tier: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "tenant_id": tenant_id,
        "quota_tier": quota_tier,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.access_token_ttl_seconds)).timestamp()),
        "iss": settings.jwt_issuer,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> TokenPayload:
    try:
        raw = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError as e:
        raise AuthError("token expired") from e
    except jwt.InvalidTokenError as e:
        raise AuthError("invalid token") from e

    try:
        return TokenPayload(**raw)
    except Exception as e:  # malformed claims
        raise AuthError("malformed token claims") from e
