"use client";

import { FormEvent, useMemo, useState } from "react";
import { BrainLoader } from "@/components/ui/brain-loader";

type Props = {
  onAuthenticated: () => void;
};

type PendingAction = "none" | "signIn" | "signUp" | "google" | "github";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.5-.2-2.2H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.9-.9 6.6-2.6l-3.1-2.4c-.9.6-2.1 1-3.5 1-2.7 0-4.9-1.8-5.7-4.2H3.2v2.5C4.9 19.8 8.2 22 12 22z"
      />
      <path
        fill="#4A90E2"
        d="M6.3 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V7.7H3.2C2.4 9.1 2 10.5 2 12s.4 2.9 1.2 4.3l3.1-2.5z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.9c1.5 0 2.9.5 3.9 1.6l2.9-2.9C16.9 3.9 14.7 3 12 3 8.2 3 4.9 5.2 3.2 8.7l3.1 2.5C7.1 8.8 9.3 6.9 12 6.9z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-current" focusable="false">
      <path d="M12 .5C5.6.5.5 5.7.5 12.1c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.4 1.2-3.3-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.3 2.9.1 3.2.8.9 1.2 2 1.2 3.3 0 4.5-2.7 5.5-5.3 5.8.4.3.8 1 .8 2.1v3.2c0 .3.2.8.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.4.5 12 .5z" />
    </svg>
  );
}

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

  function toFriendlyError(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes("invalid login credentials")) {
      return "Email or password is incorrect.";
    }
    if (normalized.includes("email not confirmed")) {
      return "Please confirm your email, then try signing in.";
    }
    if (normalized.includes("user already registered")) {
      return "An account with this email already exists. Try signing in.";
    }
    if (normalized.includes("password should contain at least one character of each")) {
      return "Password must include uppercase, lowercase, number, and symbol.";
    }
    if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
      return "Too many attempts. Wait a minute and try again.";
    }
    return "We couldn't complete that request. Please try again.";
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
        setError(toFriendlyError(message));
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
        setError(toFriendlyError(message));
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
        setError(toFriendlyError(message));
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
      <div className="mb-3 flex justify-center">
        <BrainLoader subtle />
      </div>
      <h1 className="text-2xl font-semibold text-slate-100">Sign in to Cortex</h1>
      <p className="mt-2 text-sm text-slate-400">
        Memory-aware chats from any device.
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
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter your email"
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
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter your password"
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
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "google" ? (
            "Redirecting..."
          ) : (
            <>
              <GoogleIcon />
              <span>Continue with Google</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleOAuth("github")}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "github" ? (
            "Redirecting..."
          ) : (
            <>
              <GitHubIcon />
              <span>Continue with GitHub</span>
            </>
          )}
        </button>
      </div>

      {error || hint ? (
        <div
          className={`mt-5 rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
            error
              ? "border border-rose-700/40 bg-rose-900/15 text-rose-100"
              : "border border-cyan-800/60 bg-cyan-900/20 text-cyan-100"
          }`}
        >
          {error ? <p>{error}</p> : null}
          {hint ? <p className={error ? "mt-1 text-rose-200/85" : ""}>{hint}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
