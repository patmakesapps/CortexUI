import { NextResponse } from "next/server";
import { getMemoryProvider } from "@/lib/server/providers";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await ctx.params;
    if (!threadId) return jsonError("threadId is required.", 400);

    const memory = getMemoryProvider();
    const summary = (await memory.getActiveSummary?.(threadId)) ?? null;
    return NextResponse.json({ threadId, summary });
  } catch (error) {
    return jsonError("Failed to fetch thread summary.", 500, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
