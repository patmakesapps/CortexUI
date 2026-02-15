import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, getAuthMode, resolveAppOrigin } from "@/lib/server/auth";

export const runtime = "nodejs";

const GOOGLE_STATE_COOKIE = "cortex_google_oauth_state";
const GOOGLE_PKCE_COOKIE = "cortex_google_oauth_pkce_verifier";
const GOOGLE_REQUESTED_SCOPES_COOKIE = "cortex_google_oauth_requested_scopes";
const OPTIONAL_IDENTITY_SCOPES = new Set(["openid", "email", "profile"]);

function clearOauthCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
  response.cookies.set(GOOGLE_PKCE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
  response.cookies.set(GOOGLE_REQUESTED_SCOPES_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
}

function withResultRedirect(req: NextRequest, key: string, value: string): NextResponse {
  const target = new URL("/apps", resolveAppOrigin(req));
  target.searchParams.set(key, value);
  const out = NextResponse.redirect(target);
  clearOauthCookies(out);
  return out;
}

export async function GET(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return withResultRedirect(req, "google_connect_error", "supabase_auth_disabled");
  }

  const incomingState = req.nextUrl.searchParams.get("state") ?? "";
  const expectedState = req.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  const codeVerifier = req.cookies.get(GOOGLE_PKCE_COOKIE)?.value ?? "";
  const requestedScopesRaw = req.cookies.get(GOOGLE_REQUESTED_SCOPES_COOKIE)?.value ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const providerError = req.nextUrl.searchParams.get("error") ?? "";

  if (providerError) {
    const description = req.nextUrl.searchParams.get("error_description") ?? providerError;
    return withResultRedirect(req, "google_connect_error", description.slice(0, 120));
  }
  if (!incomingState || !expectedState || incomingState !== expectedState) {
    return withResultRedirect(req, "google_connect_error", "invalid_state");
  }
  if (!code || !codeVerifier) {
    return withResultRedirect(req, "google_connect_error", "missing_code_or_verifier");
  }

  const { authorization } = getAuthFromRequest(req);
  if (!authorization) {
    return withResultRedirect(req, "google_connect_error", "not_signed_in");
  }

  const agentBase = (process.env.CORTEX_AGENT_BASE_URL ?? "http://127.0.0.1:8010")
    .trim()
    .replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${agentBase}/v1/agent/integrations/google/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier
      }),
      cache: "no-store"
    });
  } catch {
    return withResultRedirect(req, "google_connect_error", "agent_unreachable");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; error?: { message?: string } }
      | null;
    const message =
      payload?.detail ?? payload?.error?.message ?? `upstream_${response.status}`;
    return withResultRedirect(req, "google_connect_error", message.slice(0, 120));
  }

  const payload = (await response.json().catch(() => null)) as { scopes?: string[] } | null;
  const granted = new Set(normalizeScopes(payload?.scopes ?? []));
  const requested = normalizeScopes(
    requestedScopesRaw
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const missing = requested.filter(
    (scope) => !OPTIONAL_IDENTITY_SCOPES.has(scope) && !hasScope(granted, scope)
  );
  if (missing.length > 0) {
    return withResultRedirect(req, "google_connect_error", `missing_scopes:${missing.join(",")}`);
  }

  return withResultRedirect(req, "google_connected", "1");
}

function normalizeScopes(scopes: string[]): string[] {
  const out = new Set<string>();
  for (const scope of scopes) {
    for (const token of scope.split(/[,\s]+/)) {
      const cleaned = token.trim();
      if (cleaned) out.add(cleaned);
    }
  }
  return Array.from(out);
}

function hasScope(granted: Set<string>, required: string): boolean {
  if (granted.has(required)) return true;
  if (
    required === "https://www.googleapis.com/auth/gmail.readonly" ||
    required === "https://www.googleapis.com/auth/gmail.compose"
  ) {
    return (
      granted.has("https://mail.google.com/") ||
      granted.has("https://www.googleapis.com/auth/gmail.modify")
    );
  }
  if (required === "https://www.googleapis.com/auth/calendar.events") {
    return granted.has("https://www.googleapis.com/auth/calendar");
  }
  if (required === "https://www.googleapis.com/auth/drive.metadata.readonly") {
    return granted.has("https://www.googleapis.com/auth/drive.readonly");
  }
  return false;
}
