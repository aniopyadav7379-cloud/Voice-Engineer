import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.base import Base, engine
from app.routers import dev, health, voice, voice_ws
from app.services.provider_router import get_provider_router

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create tables if they don't exist. In staging/prod
    # this should be replaced by Alembic migrations run as a release step,
    # not by app startup — flagged here rather than built out, since a
    # migration pipeline is a CI/CD concern, not gateway-code.
    if settings.environment == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("dev mode: ensured tables exist")

    # warm the provider router once so the first request doesn't pay adapter
    # construction cost
    get_provider_router()

    # ensure the conversation-memory collection exists before any request
    # tries to read/write it
    from app.services.agent.dependencies import get_conversation_memory
    await get_conversation_memory().ensure_collection()

    logger.info("gateway startup complete")

    yield

    await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to actual frontend origin(s) before production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    # Uniform error shape across every stage of the chain (auth/tenant/rate-limit/route)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


app.include_router(health.router)
app.include_router(voice.router)
app.include_router(voice_ws.router)
app.include_router(dev.router)
