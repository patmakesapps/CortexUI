import { NextRequest } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { jsonError } from "@/lib/server/http";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { MemoryApiError } from "@/lib/memory/cortex-http-provider";

const ALLOWED_REACTIONS = new Set(["thumbs_up", "heart", "angry", "sad", "brain"]);

type ReactionPayload = {
  reaction?: string | null;
};

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("unauthorized") ||
    message.includes("bearer token required") ||
    message.includes("invalid or expired access token")
  );
}

function isMemoryApiError(error: unknown): error is MemoryApiError {
  return error instanceof MemoryApiError;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string; messageId: string }> }
) {
  const { threadId, messageId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);
  if (!messageId) return jsonError("messageId is required.", 400);

  const payload = (await req.json().catch(() => ({}))) as ReactionPayload;
  const rawReaction = payload.reaction;
  const reaction =
    typeof rawReaction === "string" && rawReaction.trim().length > 0
      ? rawReaction.trim()
      : null;

  if (reaction && !ALLOWED_REACTIONS.has(reaction)) {
    return jsonError("Unsupported reaction.", 422, {
      allowed: [...ALLOWED_REACTIONS]
    });
  }

  try {
    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    if (!memory.setEventReaction) {
      return jsonError("Selected memory backend does not implement setEventReaction().", 500);
    }
    const result = await memory.setEventReaction(
      threadId,
      messageId,
      reaction as "thumbs_up" | "heart" | "angry" | "sad" | "brain" | null
    );
    return Response.json({
      threadId,
      messageId,
      reaction: result.reaction,
      summaryUpdated: result.summaryUpdated
    });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    if (isMemoryApiError(error)) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "Failed to persist reaction.",
      503
    );
  }
}
