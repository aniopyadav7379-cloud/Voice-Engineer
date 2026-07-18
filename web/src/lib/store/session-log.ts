/**
 * The gateway persists VoiceSession rows in Postgres (see db/models.py)
 * but does not expose a GET endpoint to list or read them back — only
 * `voice_ws.py` writes them, nothing in `routers/` reads them. So a
 * server-backed "Session Manager" / "Conversation History" page isn't
 * possible against the current API surface without adding one (a
 * genuine backend gap worth flagging, not something to fake from the
 * frontend). This is a client-side log of sessions seen *by this
 * browser* in the meantime — real, but local-only and lost on
 * localStorage clear, not a substitute for server-side history.
 */

const STORAGE_KEY = "voice-platform.session-log";

export interface LoggedSession {
  sessionId: string;
  tenantId: string | null;
  startedAt: number;
  endedAt: number | null;
  initialLanguage: string;
  languagesUsed: string[];
  turnCount: number;
}

function read(): LoggedSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LoggedSession[]) : [];
  } catch {
    return [];
  }
}

function write(sessions: LoggedSession[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-50)));
}

export function listLoggedSessions(): LoggedSession[] {
  return read().sort((a, b) => b.startedAt - a.startedAt);
}

export function logSessionStarted(sessionId: string, tenantId: string | null, language: string) {
  const sessions = read();
  sessions.push({
    sessionId,
    tenantId,
    startedAt: Date.now(),
    endedAt: null,
    initialLanguage: language,
    languagesUsed: [language],
    turnCount: 0,
  });
  write(sessions);
}

export function logLanguageUsed(sessionId: string, language: string) {
  const sessions = read();
  const target = sessions.find((s) => s.sessionId === sessionId);
  if (target && !target.languagesUsed.includes(language)) target.languagesUsed.push(language);
  write(sessions);
}

export function logTurn(sessionId: string) {
  const sessions = read();
  const target = sessions.find((s) => s.sessionId === sessionId);
  if (target) target.turnCount += 1;
  write(sessions);
}

export function logSessionEnded(sessionId: string) {
  const sessions = read();
  const target = sessions.find((s) => s.sessionId === sessionId);
  if (target) target.endedAt = Date.now();
  write(sessions);
}

export function clearLoggedSessions() {
  window.localStorage.removeItem(STORAGE_KEY);
}
