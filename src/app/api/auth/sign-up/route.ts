import { NextRequest, NextResponse } from "next/server";
import {
  getAuthMode,
  getSupabaseConfig,
  resolveAppOrigin,
  setSessionCookies
} from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type SignUpResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string | null; identities?: unknown[] | null };
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
  if (password.length < 8) {
    return jsonError("Use at least 8 characters for your password.", 422);
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
    const emailRedirectTo = `${resolveAppOrigin(req)}/auth/callback`;
    const response = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey
      },
      body: JSON.stringify({
        email,
        password,
        options: { emailRedirectTo }
      }),
      cache: "no-store"
    });

    const payload = (await response.json().catch(() => ({}))) as SignUpResponse;
    if (!response.ok) {
      const detail =
        payload.error_description ??
        payload.msg ??
        "Account creation failed. Please try again.";
      return jsonError(detail, 400);
    }

    const hasSession = Boolean(payload.access_token && payload.refresh_token);
    const out = NextResponse.json({
      ok: true,
      pendingEmailConfirmation: !hasSession,
      message: hasSession
        ? "Account created. You are now signed in."
        : "Account created. Check your email to confirm your address.",
      user: {
        id: payload.user?.id ?? null,
        email: payload.user?.email ?? null
      }
    });
    if (hasSession && payload.access_token && payload.refresh_token) {
      setSessionCookies(
        out,
        payload.access_token,
        payload.refresh_token,
        payload.expires_in ?? 3600
      );
    }
    return out;
  } catch {
    return jsonError(
      "Sign-up service is temporarily unavailable. Please try again.",
      503
    );
  }
}
