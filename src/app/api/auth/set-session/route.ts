import { NextRequest, NextResponse } from "next/server";
import { getAuthMode, setSessionCookies } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return jsonError("Supabase auth mode is disabled.", 400);
  }

  const body = (await req.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      }
    | null;

  const accessToken = body?.access_token?.trim() ?? "";
  const refreshToken = body?.refresh_token?.trim() ?? "";
  if (!accessToken || !refreshToken) {
    return jsonError("Session token payload is incomplete.", 422);
  }

  const out = NextResponse.json({ ok: true });
  setSessionCookies(out, accessToken, refreshToken, body?.expires_in ?? 3600);
  return out;
}
