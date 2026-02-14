"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type BannerState =
  | {
      kind: "success" | "error";
      message: string;
    }
  | null;

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose"
];
const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"];
const GOOGLE_APP_SCOPES = [...GOOGLE_IDENTITY_SCOPES, ...CALENDAR_SCOPES, ...GMAIL_SCOPES];

export function AppsShell() {
  const router = useRouter();
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [googleBusy, setGoogleBusy] = useState<null | "connect" | "disconnect">(null);
  const [banner, setBanner] = useState<BannerState>(null);

  const refreshGoogleStatus = async () => {
    try {
      const res = await fetch("/api/integrations/google/status", {
        method: "GET",
        cache: "no-store"
      });
      if (!res.ok) {
        setGoogleConnected(false);
        setGrantedScopes([]);
        return;
      }
      const payload = (await res.json()) as { connected?: boolean; scopes?: string[] };
      setGoogleConnected(Boolean(payload.connected));
      setGrantedScopes(Array.isArray(payload.scopes) ? payload.scopes : []);
    } catch {
      setGoogleConnected(false);
      setGrantedScopes([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("google_connected");
    const connectError = params.get("google_connect_error");
    if (connected === "1") {
      setBanner({
        kind: "success",
        message: "Google account linked."
      });
      setGoogleConnected(true);
      params.delete("google_connected");
    } else if (connectError) {
      setBanner({
        kind: "error",
        message: `Google connect failed: ${connectError}`
      });
      params.delete("google_connect_error");
    } else {
      return;
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
    void refreshGoogleStatus();
  }, []);

  useEffect(() => {
    void refreshGoogleStatus();
  }, []);

  const connectGoogle = async () => {
    setGoogleBusy("connect");
    try {
      const res = await fetch("/api/integrations/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: GOOGLE_APP_SCOPES.join(" ") })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setBanner({
          kind: "error",
          message: payload?.error?.message ?? "Could not start Google connect flow."
        });
        return;
      }
      const payload = (await res.json()) as { url: string };
      window.location.assign(payload.url);
    } catch {
      setBanner({
        kind: "error",
        message: "Could not start Google connect flow."
      });
    } finally {
      setGoogleBusy(null);
    }
  };

  const disconnectGoogle = async () => {
    setGoogleBusy("disconnect");
    try {
      const res = await fetch("/api/integrations/google/disconnect", {
        method: "POST"
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setBanner({
          kind: "error",
          message: payload?.error?.message ?? "Could not disconnect Google."
        });
        return;
      }
      setGoogleConnected(false);
      setGrantedScopes([]);
      setBanner({ kind: "success", message: "Google disconnected." });
      await refreshGoogleStatus();
    } catch {
      setBanner({
        kind: "error",
        message: "Could not disconnect Google."
      });
    } finally {
      setGoogleBusy(null);
    }
  };

  const hasScopes = (required: string[]): boolean => {
    const granted = new Set(
      grantedScopes
        .flatMap((raw) => raw.split(/[,\s]+/))
        .map((value) => value.trim())
        .filter(Boolean)
    );
    const has = (scope: string) => granted.has(scope);

    const hasGmailSuperScope =
      has("https://mail.google.com/") || has("https://www.googleapis.com/auth/gmail.modify");
    const hasCalendarSuperScope = has("https://www.googleapis.com/auth/calendar");

    return required.every((scope) => {
      if (scope === "https://www.googleapis.com/auth/gmail.readonly") {
        return has(scope) || hasGmailSuperScope;
      }
      if (scope === "https://www.googleapis.com/auth/gmail.compose") {
        return has(scope) || hasGmailSuperScope;
      }
      if (scope === "https://www.googleapis.com/auth/calendar.events") {
        return has(scope) || hasCalendarSuperScope;
      }
      return has(scope);
    });
  };
  const calendarReady = Boolean(googleConnected) && hasScopes(CALENDAR_SCOPES);
  const gmailReady = Boolean(googleConnected) && hasScopes(GMAIL_SCOPES);
  const allGoogleAppsReady = calendarReady && gmailReady;

  return (
    <main className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-8 md:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Apps & Services</h1>
          <p className="mt-2 text-sm text-slate-400">
            Connect external apps so Cortex can use agent tools on your behalf.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/80 px-3 text-sm text-slate-100 transition hover:bg-slate-700/80"
        >
          Back to Chat
        </button>
      </div>

      {banner && banner.kind === "error" ? (
        <div
          className="mb-4 rounded-lg border border-rose-500/50 bg-rose-900/35 px-3 py-2 text-sm text-rose-100"
        >
          <div className="flex items-center justify-between gap-3">
            <span>{banner.message}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs text-slate-200 hover:text-slate-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <IntegrationCard
          name="Google"
          description="One connection for all Google apps. Current: Calendar and Gmail."
          icon={<GoogleIcon />}
          connected={allGoogleAppsReady}
          checking={googleConnected === null}
          buttonLabel={allGoogleAppsReady ? "Disconnect Google" : "Connect Google"}
          busy={allGoogleAppsReady ? googleBusy === "disconnect" : googleBusy === "connect"}
          onConnect={() => (allGoogleAppsReady ? void disconnectGoogle() : void connectGoogle())}
          extra={
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              <AppStatusRow
                icon={<CalendarIcon />}
                name="Google Calendar"
                description="Read upcoming events and create calendar events."
                ready={calendarReady}
              />
              <AppStatusRow
                icon={<GmailIcon />}
                name="Gmail"
                description="Read threads, draft replies, and send after confirmation."
                ready={gmailReady}
              />
            </div>
          }
        />
      </div>
    </main>
  );
}

function IntegrationCard(props: {
  name: string;
  description: string;
  icon: ReactNode;
  connected: boolean;
  checking: boolean;
  busy: boolean;
  buttonLabel: string;
  onConnect: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/65 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-slate-800/80">
            {props.icon}
          </div>
          <div>
            <h2 className="text-lg font-medium text-slate-100">{props.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{props.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              Connect/disconnect applies to all Google apps in this group.
            </p>
          </div>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs ${
            props.connected
              ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
              : "border-amber-500/45 bg-amber-500/15 text-amber-200"
          }`}
        >
          {props.checking ? "Checking..." : props.connected ? "Connected" : "Permissions required"}
        </span>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={props.onConnect}
          disabled={props.busy}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/80 px-4 text-sm text-slate-100 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.busy ? "Connecting..." : props.buttonLabel}
        </button>
      </div>
      {props.extra}
    </div>
  );
}

function AppStatusRow(props: {
  icon: ReactNode;
  name: string;
  description: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800/80">
          {props.icon}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-100">{props.name}</p>
          <p className="text-xs text-slate-400">{props.description}</p>
        </div>
      </div>
      <span
        className={`rounded border px-2 py-1 text-xs ${
          props.ready
            ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
            : "border-amber-500/45 bg-amber-500/15 text-amber-200"
        }`}
      >
        {props.ready ? "Ready" : "Needs scope"}
      </span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M21.35 12.15c0-.77-.07-1.5-.2-2.2H12v4.17h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.7 2.92-4.2 2.92-7.33Z"
        fill="#4285F4"
      />
      <path
        d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.99.92-3.31.92-2.55 0-4.71-1.72-5.48-4.02H3.28v2.5A9.73 9.73 0 0 0 12 21.6Z"
        fill="#34A853"
      />
      <path
        d="M6.52 13.71a5.86 5.86 0 0 1 0-3.42v-2.5H3.28a9.73 9.73 0 0 0 0 8.42l3.24-2.5Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.27c1.43 0 2.72.49 3.73 1.46l2.8-2.8C16.84 3.37 14.63 2.4 12 2.4a9.73 9.73 0 0 0-8.72 5.39l3.24 2.5c.77-2.3 2.93-4.02 5.48-4.02Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#8ab4f8" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#4285f4" />
      <rect x="7" y="2" width="2" height="5" rx="1" fill="#e8f0fe" />
      <rect x="15" y="2" width="2" height="5" rx="1" fill="#e8f0fe" />
      <rect x="7" y="12" width="4" height="4" rx="1" fill="#0b57d0" />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" fill="#ffffff" />
      <path d="M4 7.5L12 13.5L20 7.5V18H4V7.5Z" fill="#e8eaed" />
      <path d="M4 7.5V18H7V10.2L12 13.9L17 10.2V18H20V7.5L12 13.5L4 7.5Z" fill="#ea4335" />
    </svg>
  );
}
