"""
Wraps VoiceSession CRUD so the WebSocket handler doesn't embed SQL. Writes
happen only at session start, language switch, and session end — not per
frame or per utterance — since per-utterance DB writes would blow the
latency budget for no analytical benefit stage 2 needs.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import VoiceSession


class SessionManager:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def start(self, *, tenant_id: uuid.UUID, initial_language: str) -> VoiceSession:
        session = VoiceSession(
            tenant_id=tenant_id,
            current_language=initial_language,
            language_history=initial_language,
            status="active",
        )
        self._db.add(session)
        await self._db.commit()
        await self._db.refresh(session)
        return session

    async def record_language(self, session: VoiceSession, language: str) -> None:
        if language == session.current_language:
            return
        session.current_language = language
        session.language_history = f"{session.language_history},{language}"
        await self._db.commit()

    async def end(self, session: VoiceSession, *, status: str = "closed") -> None:
        from sqlalchemy import func

        session.status = status
        session.ended_at = func.now()
        await self._db.commit()
