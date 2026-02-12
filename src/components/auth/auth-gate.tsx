"use client";

import { useEffect, useState } from "react";
import { ChatShell } from "@/components/chat/chat-shell";
import { AuthPanel } from "@/components/auth/auth-panel";

type SessionState = {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  error: string | null;
};

type Props = {
  requireAuth: boolean;
};

export function AuthGate({ requireAuth }: Props) {
  const [session, setSession] = useState<SessionState>({
    loading: requireAuth,
    authenticated: !requireAuth,
    email: null,
    error: null
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function refreshSession() {
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
  }

  useEffect(() => {
    void refreshSession();
  }, [requireAuth]);

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
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
          Checking your session...
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
    <div className="relative h-[100dvh]">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 border-b border-slate-700/60 bg-slate-950/50 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 text-xs text-slate-300">
          <span className="hidden md:inline">{session.email ?? "Signed in"}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            className="pointer-events-auto rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
      <ChatShell allowLocalFallback={!requireAuth} />
    </div>
  );
}
