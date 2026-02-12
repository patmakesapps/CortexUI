import { NextRequest, NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { jsonError } from "@/lib/server/http";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";

export const runtime = "nodejs";

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("unauthorized") ||
    message.includes("bearer token required") ||
    message.includes("invalid or expired access token")
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await ctx.params;
    if (!threadId) return jsonError("threadId is required.", 400);
    if (threadId.startsWith("local-")) {
      return NextResponse.json({ threadId, summary: null });
    }

    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    const summary = (await memory.getActiveSummary?.(threadId)) ?? null;
    return NextResponse.json({ threadId, summary });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    const { threadId } = await ctx.params;
    return NextResponse.json({
      threadId,
      summary: null,
      degraded: true,
      warning: error instanceof Error ? error.message : "unknown"
    });
  }
}
