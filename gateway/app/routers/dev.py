"""
Dev/test convenience only — issues a signed JWT for a given tenant so you
can exercise the gateway chain without standing up a full identity
provider. Disabled outside 'development' so it never ships as a backdoor.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.core.security import create_access_token

router = APIRouter(prefix="/v1/dev", tags=["dev"])


class DevTokenRequest(BaseModel):
    tenant_id: str
    quota_tier: str = "standard"


@router.post("/token")
async def issue_dev_token(body: DevTokenRequest) -> dict:
    if settings.environment != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    token = create_access_token(subject="dev-user", tenant_id=body.tenant_id, quota_tier=body.quota_tier)
    return {"access_token": token, "token_type": "bearer"}
