import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  decodeJwtPayload,
  getAuthMode
} from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const mode = getAuthMode();
  if (mode !== "supabase") {
    return NextResponse.json({
      mode,
      authenticated: true,
      user: null
    });
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() ?? "";
  if (!accessToken) {
    return NextResponse.json({
      mode,
      authenticated: false,
      user: null
    });
  }

  const payload = decodeJwtPayload(accessToken);
  const now = Math.floor(Date.now() / 1000);
  const expired = typeof payload?.exp === "number" && payload.exp <= now;
  if (!payload?.sub || expired) {
    return NextResponse.json({
      mode,
      authenticated: false,
      user: null
    });
  }

  return NextResponse.json({
    mode,
    authenticated: true,
    user: {
      id: payload.sub,
      email: payload.email ?? null
    }
  });
}
