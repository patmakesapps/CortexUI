import { NextRequest, NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { MemoryApiError } from "@/lib/memory/cortex-http-provider";

export const runtime = "nodejs";

type RenamePayload = {
  title?: string;
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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);

  const payload = (await req.json().catch(() => ({}))) as RenamePayload;
  const rawTitle = typeof payload.title === "string" ? payload.title : "";
  const title = rawTitle.trim();
  if (!title) return jsonError("title is required.", 400);
  if (title.length > 120) return jsonError("title exceeds max length.", 422);

  try {
    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    if (!memory.renameThread) {
      return jsonError("Selected memory backend does not support thread rename.", 501);
    }
    await memory.renameThread(threadId, title);
    return NextResponse.json({ threadId, title, ok: true });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    if (isMemoryApiError(error)) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Could not rename thread right now.", 503, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);
  if (threadId.startsWith("draft-")) return jsonError("threadId is invalid.", 400);

  try {
    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    if (!memory.deleteThread) {
      return jsonError("Selected memory backend does not support thread delete.", 501);
    }
    await memory.deleteThread(threadId);
    return NextResponse.json({ threadId, ok: true });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    if (isMemoryApiError(error)) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Could not delete thread right now.", 503, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
