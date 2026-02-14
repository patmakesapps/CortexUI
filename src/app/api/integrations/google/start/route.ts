import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, getAuthMode, resolveAppOrigin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

const GOOGLE_STATE_COOKIE = "cortex_google_oauth_state";
const GOOGLE_PKCE_COOKIE = "cortex_google_oauth_pkce_verifier";
const DEFAULT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly"
];

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256Base64Url(input: string): string {
  return base64Url(createHash("sha256").update(input).digest());
}

function normalizeScopes(raw: string | null): string[] {
  if (!raw || !raw.trim()) return DEFAULT_SCOPES;
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveRedirectUri(req: NextRequest): string {
  const configured = (process.env.GOOGLE_REDIRECT_URI ?? "").trim();
  if (configured) return configured;
  return `${resolveAppOrigin(req)}/api/integrations/google/callback`;
}

export async function POST(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return jsonError("Supabase auth mode is disabled.", 400);
  }

  const { authorization } = getAuthFromRequest(req);
  if (!authorization) {
    return jsonError("Sign in is required before connecting Google.", 401);
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  if (!clientId) {
    return jsonError("GOOGLE_CLIENT_ID is not configured.", 503);
  }

  const body = (await req.json().catch(() => null)) as { scopes?: string } | null;
  const scopes = normalizeScopes(body?.scopes ?? null);
  const state = base64Url(randomBytes(24));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = sha256Base64Url(codeVerifier);
  const redirectUri = resolveRedirectUri(req);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent"
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const out = NextResponse.json({ ok: true, url, scopes, redirectUri });
  const secure = process.env.NODE_ENV === "production";
  out.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10
  });
  out.cookies.set(GOOGLE_PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10
  });
  return out;
}
