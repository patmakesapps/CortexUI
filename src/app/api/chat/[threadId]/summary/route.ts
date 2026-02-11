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
    if (threadId.startsWith("local-")) {
      return NextResponse.json({ threadId, summary: null });
    }

    const memory = getMemoryProvider();
    const summary = (await memory.getActiveSummary?.(threadId)) ?? null;
    return NextResponse.json({ threadId, summary });
  } catch (error) {
    const { threadId } = await ctx.params;
    return NextResponse.json({
      threadId,
      summary: null,
      degraded: true,
      warning: error instanceof Error ? error.message : "unknown"
    });
  }
}
