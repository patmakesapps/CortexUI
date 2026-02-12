"use client";

import { FormEvent, useMemo, useState } from "react";

type Props = {
  onAuthenticated: () => void;
};

type PendingAction = "none" | "signIn" | "signUp" | "google" | "github";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPanel({ onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>("none");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const isBusy = pendingAction !== "none";
  const canSubmit = useMemo(
    () => EMAIL_PATTERN.test(email.trim()) && password.length >= 8 && !isBusy,
    [email, isBusy, password.length]
  );

  async function readError(res: Response): Promise<string> {
    const fallback = "Something went wrong. Please try again.";
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return payload?.error?.message ?? fallback;
  }

  function toFriendlyHint(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes("invalid login credentials")) {
      return "Double-check your email/password, or create an account if you are new.";
    }
    if (normalized.includes("email not confirmed")) {
      return "Check your inbox for the confirmation email, then try signing in again.";
    }
    if (normalized.includes("password")) {
      return "Use at least 8 characters and avoid reusing old passwords.";
    }
    return "If this continues, try OAuth (Google/GitHub) or wait a minute and retry.";
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPendingAction("signIn");
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const message = await readError(res);
        setError(message);
        setHint(toFriendlyHint(message));
        return;
      }
      onAuthenticated();
    } catch {
      setError("Unable to reach sign-in service.");
      setHint("Check your connection and retry.");
    } finally {
      setPendingAction("none");
    }
  }

  async function handleSignUp() {
    if (!canSubmit) return;
    setPendingAction("signUp");
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await res.json().catch(() => null)) as
        | { pendingEmailConfirmation?: boolean; message?: string; error?: { message?: string } }
        | null;
      if (!res.ok) {
        const message = payload?.error?.message ?? "Account creation failed.";
        setError(message);
        setHint(toFriendlyHint(message));
        return;
      }

      if (payload?.pendingEmailConfirmation) {
        setHint(
          payload.message ??
            "Account created. Check your email to confirm your account."
        );
        return;
      }
      onAuthenticated();
    } catch {
      setError("Unable to reach account service.");
      setHint("Try again in a moment.");
    } finally {
      setPendingAction("none");
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setPendingAction(provider);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/auth/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      if (!res.ok) {
        const message = await readError(res);
        setError(message);
        setHint(toFriendlyHint(message));
        return;
      }
      const payload = (await res.json()) as { url: string };
      window.location.assign(payload.url);
    } catch {
      setError("OAuth provider could not be started.");
      setHint("Please retry, or use email sign-in.");
    } finally {
      setPendingAction("none");
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col rounded-2xl border border-slate-700/60 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur">
      <h1 className="text-2xl font-semibold text-slate-100">Sign in to Cortex</h1>
      <p className="mt-2 text-sm text-slate-400">
        Continue your memory-aware chats from any device.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="Minimum 8 characters"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAction === "signIn" ? "Signing in..." : "Sign In"}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSignUp}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAction === "signUp" ? "Creating..." : "Create Account"}
          </button>
        </div>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-700/70" />
        <span className="text-xs uppercase tracking-wide text-slate-500">or</span>
        <div className="h-px flex-1 bg-slate-700/70" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleOAuth("google")}
          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "google" ? "Redirecting..." : "Continue with Google"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleOAuth("github")}
          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "github" ? "Redirecting..." : "Continue with GitHub"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div className="mt-3 rounded-xl border border-cyan-800/60 bg-cyan-900/20 px-3 py-2 text-sm text-cyan-100">
          {hint}
        </div>
      ) : null}
    </section>
  );
}
