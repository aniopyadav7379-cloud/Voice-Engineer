"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { decodeTokenPayload, DEV_TENANT_ID, isTokenExpired, issueDevToken } from "@/lib/api/auth";

const STORAGE_KEY = "voice-platform.session";

interface StoredSession {
  token: string;
  tenantId: string;
  quotaTier: string;
}

interface AuthContextValue {
  token: string | null;
  tenantId: string | null;
  quotaTier: string | null;
  isExpired: boolean;
  isReady: boolean;
  setToken: (token: string, tenantId: string, quotaTier?: string) => void;
  clearToken: () => void;
  requestDevToken: (tenantId?: string, quotaTier?: string) => Promise<void>;
  devTokenError: string | null;
  isRequestingDevToken: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [devTokenError, setDevTokenError] = useState<string | null>(null);
  const [isRequestingDevToken, setIsRequestingDevToken] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      // ignore corrupted storage
    } finally {
      setIsReady(true);
    }
  }, []);

  const persist = useCallback((next: StoredSession | null) => {
    setSession(next);
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setToken = useCallback(
    (token: string, tenantId: string, quotaTier = "standard") => {
      setDevTokenError(null);
      persist({ token, tenantId, quotaTier });
    },
    [persist]
  );

  const clearToken = useCallback(() => persist(null), [persist]);

  const requestDevToken = useCallback(
    async (tenantId = DEV_TENANT_ID, quotaTier = "standard") => {
      setIsRequestingDevToken(true);
      setDevTokenError(null);
      try {
        const res = await issueDevToken({ tenant_id: tenantId, quota_tier: quotaTier });
        persist({ token: res.access_token, tenantId, quotaTier });
      } catch (e) {
        setDevTokenError(e instanceof Error ? e.message : "Failed to issue dev token.");
      } finally {
        setIsRequestingDevToken(false);
      }
    },
    [persist]
  );

  const isExpired = useMemo(() => (session ? isTokenExpired(session.token) : false), [session]);

  const value: AuthContextValue = {
    token: session?.token ?? null,
    tenantId: session?.tenantId ?? null,
    quotaTier: session?.quotaTier ?? null,
    isExpired,
    isReady,
    setToken,
    clearToken,
    requestDevToken,
    devTokenError,
    isRequestingDevToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function tokenClaims(token: string) {
  return decodeTokenPayload(token);
}
