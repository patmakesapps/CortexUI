import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookies,
  getAuthMode,
  getSupabaseConfig,
  setSessionCookies
} from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string | null };
  error_description?: string;
  msg?: string;
};

export async function POST(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return jsonError("Supabase auth mode is disabled.", 400);
  }

  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) {
    return jsonError("Email and password are required.", 422);
  }

  try {
    let url: string;
    let anonKey: string;
    try {
      ({ url, anonKey } = getSupabaseConfig());
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? error.message
          : "Supabase auth is not configured for this environment.",
        503
      );
    }
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store"
    });

    const payload = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      const detail =
        payload.error_description ??
        payload.msg ??
        "We could not sign you in. Check your credentials and try again.";
      return jsonError(detail, 401);
    }

    const out = NextResponse.json({
      ok: true,
      user: {
        id: payload.user?.id ?? null,
        email: payload.user?.email ?? null
      }
    });
    setSessionCookies(
      out,
      payload.access_token,
      payload.refresh_token,
      payload.expires_in ?? 3600
    );
    return out;
  } catch {
    const out = jsonError(
      "Sign-in service is temporarily unavailable. Please try again.",
      503
    );
    clearSessionCookies(out);
    return out;
  }
}
