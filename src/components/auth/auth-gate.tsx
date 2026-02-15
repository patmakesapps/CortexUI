"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatShell } from "@/components/chat/chat-shell";
import { AppsShell } from "@/components/apps/apps-shell";
import { AuthPanel } from "@/components/auth/auth-panel";
import { BrainLoader } from "@/components/ui/brain-loader";
import { ThemeSelect } from "@/components/ui/theme-select";

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
        <div className="ui-panel flex flex-col items-center gap-3 rounded-xl px-6 py-5 text-sm ui-text-body">
          <BrainLoader />
          <p>Checking your session...</p>
        </div>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main className="relative flex h-[100dvh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <AuthPanel onAuthenticated={refreshSession} />
          {session.error ? (
            <p className="mt-3 text-center text-xs text-[rgb(var(--status-danger)/1)]">
              {session.error}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden">
      <div className="ui-topbar pointer-events-none absolute inset-x-0 top-0 z-20 px-4 py-4 shadow-[0_16px_42px_rgba(2,6,23,0.28)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs ui-text-muted">
          <span className="text-sm font-semibold tracking-[0.14em] text-[rgb(var(--accent)/1)]">
            Cortex AI
          </span>
          <div className="pointer-events-auto flex items-center gap-3">
            <span className="hidden md:inline">{session.email ?? "Signed in"}</span>
            <ThemeSelect />
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              className="ui-button inline-flex h-[34px] items-center rounded-md px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
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
