"""
Stage 1 of the gateway chain: authentication only. Deliberately does not
touch the database — that's the tenant stage's job. Keeping this stage
DB-free is what lets it stay under the <5ms budget even under load.
"""
from fastapi import Header, HTTPException, Query, WebSocketException, status

from app.core.security import AuthError, TokenPayload, decode_access_token


async def get_current_token(authorization: str = Header(...)) -> TokenPayload:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected 'Authorization: Bearer <token>' header",
        )

    raw_token = authorization.removeprefix("Bearer ").strip()

    try:
        return decode_access_token(raw_token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e


async def get_current_token_ws(token: str = Query(...)) -> TokenPayload:
    """WebSocket variant. Browsers can't set custom headers during the WS
    handshake, so the token travels as a query param instead — standard
    practice for browser-originated WebSocket auth. This does mean the
    token can end up in server access logs; mitigate with short-lived
    tokens (see settings.access_token_ttl_seconds) and TLS everywhere,
    not by trying to avoid query-param auth altogether."""
    try:
        return decode_access_token(token)
    except AuthError as e:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason=str(e)) from e
