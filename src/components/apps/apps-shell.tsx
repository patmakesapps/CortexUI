"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BannerState =
  | {
      kind: "success" | "error";
      message: string;
    }
  | null;

export function AppsShell() {
  const router = useRouter();
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("google_connected");
    const connectError = params.get("google_connect_error");
    if (connected === "1") {
      setBanner({ kind: "success", message: "Google Calendar connected." });
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
  }, []);

  useEffect(() => {
    let disposed = false;
    const run = async () => {
      try {
        const res = await fetch("/api/integrations/google/status", { method: "GET" });
        if (!res.ok) {
          if (!disposed) setGoogleConnected(false);
          return;
        }
        const payload = (await res.json()) as { connected?: boolean };
        if (!disposed) setGoogleConnected(Boolean(payload.connected));
      } catch {
        if (!disposed) setGoogleConnected(false);
      }
    };
    void run();
    return () => {
      disposed = true;
    };
  }, []);

  const connectGoogle = async () => {
    setGoogleBusy(true);
    try {
      const res = await fetch("/api/integrations/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
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
      setGoogleBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    setGoogleBusy(true);
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
          message: payload?.error?.message ?? "Could not disconnect Google Calendar."
        });
        return;
      }
      setGoogleConnected(false);
      setBanner({ kind: "success", message: "Google Calendar disconnected." });
    } catch {
      setBanner({
        kind: "error",
        message: "Could not disconnect Google Calendar."
      });
    } finally {
      setGoogleBusy(false);
    }
  };

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

      {banner ? (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            banner.kind === "success"
              ? "border-emerald-500/50 bg-emerald-900/35 text-emerald-100"
              : "border-rose-500/50 bg-rose-900/35 text-rose-100"
          }`}
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

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/65 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-slate-100">Google Calendar</h2>
            <p className="mt-1 text-sm text-slate-400">
              Read upcoming events and create events in your primary calendar.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Connection is account-level and remains linked after sign out until you disconnect it.
            </p>
          </div>
          <span
            className={`rounded border px-2 py-1 text-xs ${
              googleConnected
                ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
                : "border-amber-500/45 bg-amber-500/15 text-amber-200"
            }`}
          >
            {googleConnected === null
              ? "Checking..."
              : googleConnected
                ? "Connected"
                : "Not connected"}
          </span>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void (googleConnected ? disconnectGoogle() : connectGoogle())}
            disabled={googleBusy}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/80 px-4 text-sm text-slate-100 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleBusy
              ? googleConnected
                ? "Disconnecting..."
                : "Connecting..."
              : googleConnected
                ? "Disconnect Google Calendar"
                : "Connect Google Calendar"}
          </button>
        </div>
      </div>
    </main>
  );
}
