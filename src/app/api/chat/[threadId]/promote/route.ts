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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);
  if (threadId.startsWith("draft-") || threadId.startsWith("local-")) {
    return jsonError("threadId is invalid.", 400);
  }

  try {
    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    if (!memory.promoteThreadToCoreMemory) {
      return jsonError(
        "Selected memory backend does not support core memory promotion.",
        501
      );
    }
    const result = await memory.promoteThreadToCoreMemory(threadId);
    return NextResponse.json({
      threadId,
      summary: result.summary,
      summaryUpdated: result.summaryUpdated,
      isCoreMemory: result.isCoreMemory,
      ok: true
    });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    return jsonError("Could not promote thread to core memory right now.", 503, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
