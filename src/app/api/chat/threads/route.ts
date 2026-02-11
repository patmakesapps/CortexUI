import { NextRequest, NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { resolveStableUserId } from "@/lib/server/user-id";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = resolveStableUserId(req);
    const memory = getMemoryProvider();
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
    return jsonError("Failed to list threads.", 500, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveStableUserId(req);
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : undefined;
    const memory = getMemoryProvider();
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
    return jsonError("Failed to create thread.", 500, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
