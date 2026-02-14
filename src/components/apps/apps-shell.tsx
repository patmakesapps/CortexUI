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

export function AppsShell() {
  const router = useRouter();
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [googleBusy, setGoogleBusy] = useState<null | "calendar" | "gmail" | "disconnect">(null);
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
        message: "Google account linked. Grant access for each app below."
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

  const connectGoogle = async (
    app: "calendar" | "gmail",
    scopes: string[]
  ) => {
    setGoogleBusy(app);
    try {
      const res = await fetch("/api/integrations/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: [...GOOGLE_IDENTITY_SCOPES, ...scopes].join(" ") })
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
          name="Google Calendar"
          description="Read upcoming events and create events in your primary calendar."
          icon={<CalendarIcon />}
          connected={calendarReady}
          checking={googleConnected === null}
          buttonLabel={calendarReady ? "Disconnect Google Access" : "Grant Calendar Access"}
          busy={calendarReady ? googleBusy === "disconnect" : googleBusy === "calendar"}
          onConnect={() =>
            calendarReady
              ? void disconnectGoogle()
              : void connectGoogle("calendar", CALENDAR_SCOPES)
          }
        />

        <IntegrationCard
          name="Gmail"
          description="List recent threads, read email messages, draft replies, and send after confirmation."
          icon={<GmailIcon />}
          connected={gmailReady}
          checking={googleConnected === null}
          buttonLabel={gmailReady ? "Disconnect Google Access" : "Grant Gmail Access"}
          busy={gmailReady ? googleBusy === "disconnect" : googleBusy === "gmail"}
          onConnect={() =>
            gmailReady ? void disconnectGoogle() : void connectGoogle("gmail", GMAIL_SCOPES)
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
              Google access is shared across Calendar and Gmail. Disconnecting from either card
              disconnects both.
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
    </div>
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
