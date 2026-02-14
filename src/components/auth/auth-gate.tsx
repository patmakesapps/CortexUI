"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatShell } from "@/components/chat/chat-shell";
import { AppsShell } from "@/components/apps/apps-shell";
import { AuthPanel } from "@/components/auth/auth-panel";
import { BrainLoader } from "@/components/ui/brain-loader";

type SessionState = {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  error: string | null;
};

type Props = {
  requireAuth: boolean;
  view?: "chat" | "apps";
};

export function AuthGate({ requireAuth, view = "chat" }: Props) {
  const [session, setSession] = useState<SessionState>({
    loading: requireAuth,
    authenticated: !requireAuth,
    email: null,
    error: null
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!requireAuth) return;
    setSession((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/auth/session", { method: "GET" });
      if (!res.ok) {
        setSession({
          loading: false,
          authenticated: false,
          email: null,
          error: "Unable to verify session."
        });
        return;
      }
      const payload = (await res.json()) as {
        authenticated?: boolean;
        user?: { email?: string | null } | null;
      };
      setSession({
        loading: false,
        authenticated: Boolean(payload.authenticated),
        email: payload.user?.email ?? null,
        error: null
      });
    } catch {
      setSession({
        loading: false,
        authenticated: false,
        email: null,
        error: "Auth check failed. Please refresh and try again."
      });
    }
  }, [requireAuth]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function signOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setIsSigningOut(false);
      setSession({
        loading: false,
        authenticated: false,
        email: null,
        error: null
      });
    }
  }

  if (session.loading) {
    return (
      <main className="flex h-[100dvh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/70 px-6 py-5 text-sm text-slate-300">
          <BrainLoader />
          <p>Checking your session...</p>
        </div>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main className="flex h-[100dvh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <AuthPanel onAuthenticated={refreshSession} />
          {session.error ? (
            <p className="mt-3 text-center text-xs text-rose-300">{session.error}</p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-slate-200/15 bg-slate-900/45 px-4 py-4 shadow-[0_16px_42px_rgba(2,6,23,0.5)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs text-slate-300">
          <span className="text-sm font-semibold tracking-[0.14em] text-cyan-200/95">Cortex AI</span>
          <div className="pointer-events-auto flex items-center gap-3">
            <span className="hidden md:inline">{session.email ?? "Signed in"}</span>
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              className="rounded-md border border-slate-500/75 bg-slate-800/75 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-slate-700/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </div>
      <div className="h-full pt-[78px]">
        {view === "apps" ? <AppsShell /> : <ChatShell />}
      </div>
    </div>
  );
}
