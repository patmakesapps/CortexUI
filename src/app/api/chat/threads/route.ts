import { NextRequest, NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { resolveStableUserId } from "@/lib/server/user-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = resolveStableUserId(req);
  try {
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
  try {
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
    const threadId = `local-${crypto.randomUUID()}`;
    const response = NextResponse.json(
      {
        userId,
        threadId,
        degraded: true,
        warning: error instanceof Error ? error.message : "unknown"
      },
      { status: 201 }
    );
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
