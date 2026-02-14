import { NextRequest, NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { resolveStableUserId } from "@/lib/server/user-id";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("unauthorized") ||
    message.includes("bearer token required") ||
    message.includes("invalid or expired access token")
  );
}

export async function GET(req: NextRequest) {
  const userId = resolveStableUserId(req);
  const { authorization } = getAuthFromRequest(req);
  try {
    const memory = getMemoryProvider(authorization);
    const threads = (await memory.listThreads?.(userId, 50)) ?? [];
    const response = NextResponse.json({ userId, threads });
    if (!req.cookies.get("cortex_user_id")) {
      response.cookies.set("cortex_user_id", userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
    }
    return response;
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    const response = NextResponse.json({
      userId,
      threads: [],
      degraded: true,
      warning: error instanceof Error ? error.message : "unknown"
    });
    if (!req.cookies.get("cortex_user_id")) {
      response.cookies.set("cortex_user_id", userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
    }
    return response;
  }
}

export async function POST(req: NextRequest) {
  const userId = resolveStableUserId(req);
  const { authorization } = getAuthFromRequest(req);
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : undefined;
    const memory = getMemoryProvider(authorization);
    const threadId = await memory.startThread(userId, title);
    const response = NextResponse.json({ userId, threadId }, { status: 201 });
    if (!req.cookies.get("cortex_user_id")) {
      response.cookies.set("cortex_user_id", userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
    }
    return response;
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    return jsonError("Could not create a thread at the moment.", 503, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
