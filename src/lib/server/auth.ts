import type { NextRequest, NextResponse } from "next/server";

export const ACCESS_TOKEN_COOKIE = "cortex_access_token";
export const REFRESH_TOKEN_COOKIE = "cortex_refresh_token";

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type JwtPayload = {
  sub?: string;
  email?: string;
  exp?: number;
};

export function getAuthMode(): "dev" | "supabase" {
  return (process.env.AUTH_MODE ?? "dev").toLowerCase() === "supabase"
    ? "supabase"
    : "dev";
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, anonKey };
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as JwtPayload;
    return parsed;
  } catch {
    return null;
  }
}

export function getAuthFromRequest(
  req: NextRequest
): { authorization: string | null; accessToken: string | null } {
  const incoming = req.headers.get("authorization");
  if (incoming && incoming.trim()) {
    return { authorization: incoming.trim(), accessToken: null };
  }
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() ?? "";
  if (!accessToken) {
    return { authorization: null, accessToken: null };
  }
  return {
    authorization: `Bearer ${accessToken}`,
    accessToken
  };
}

export function setSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.max(60, expiresInSeconds)
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
}

export function resolveAppOrigin(req: NextRequest): string {
  const configured = (process.env.APP_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}
