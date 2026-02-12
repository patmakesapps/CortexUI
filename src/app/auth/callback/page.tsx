"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function parseHashParams(hash: string): URLSearchParams {
  const cleaned = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(cleaned);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const fallbackHint = useMemo(
    () => "If this persists, retry sign-in from the home page.",
    []
  );

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const queryError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      if (queryError) {
        setError(queryError);
        return;
      }

      const hash = parseHashParams(window.location.hash);
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const expiresIn = Number(hash.get("expires_in") ?? "3600");

      if (!accessToken || !refreshToken) {
        router.replace("/");
        return;
      }

      const res = await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600
        })
      });
      if (!res.ok) {
        setError("We could not finalize your sign-in session.");
        return;
      }
      router.replace("/");
    };
    void run();
  }, [router]);

  return (
    <main className="flex h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-rose-200">Sign-in failed</h1>
            <p className="mt-2 text-sm text-rose-100">{error}</p>
            <p className="mt-2 text-xs text-slate-400">{fallbackHint}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-100">
              Completing sign-in...
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              One moment while we secure your session.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
