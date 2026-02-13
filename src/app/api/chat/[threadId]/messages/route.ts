import { NextRequest } from "next/server";
import { getLlmProvider, getMemoryProvider } from "@/lib/server/providers";
import { jsonError } from "@/lib/server/http";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { MemoryApiError } from "@/lib/memory/cortex-http-provider";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 6000;

type MessagePayload = {
  text?: string;
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);
  if (threadId.startsWith("local-")) {
    return Response.json({ threadId, messages: [] });
  }

  try {
    const memory = getMemoryProvider(getAuthFromRequest(req).authorization);
    const messages = await memory.getRecentEvents(threadId, 100);
    return Response.json({ threadId, messages });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    if (isMemoryApiError(error)) {
      return jsonError(error.message, error.status);
    }
    return Response.json({
      threadId,
      messages: [],
      degraded: true,
      warning: error instanceof Error ? error.message : "unknown"
    });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);

  const payload = (await req.json().catch(() => ({}))) as MessagePayload;
  const rawText = typeof payload.text === "string" ? payload.text : "";
  const text = rawText.trim();

  if (!text) return jsonError("Message text is required.", 400);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonError("Message text exceeds max length.", 422, {
      maxLength: MAX_MESSAGE_LENGTH
    });
  }

  const demoMode = process.env.CHAT_DEMO_MODE !== "false";
  const isLocalThread = threadId.startsWith("local-");
  const shouldUseDemo = demoMode || isLocalThread;
  const memory = getMemoryProvider(getAuthFromRequest(req).authorization);

  if (shouldUseDemo) {
    const llm = getLlmProvider();
    let stream: AsyncIterable<string>;
    try {
      stream = llm.streamChat({
        messages: [{ role: "user", content: text }],
        signal: req.signal
      });
    } catch (error) {
      return jsonError("Failed to initialize demo stream.", 500, {
        cause: error instanceof Error ? error.message : "unknown"
      });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unexpected stream error";
          controller.enqueue(
            encoder.encode(`\n[Stream error: ${message}. Please retry.]\n`)
          );
          controller.close();
        }
      }
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  }

  try {
    if (!memory.chat) {
      return jsonError("Selected memory backend does not implement chat().", 500);
    }
    const upstream = await memory.chat(threadId, text, req.signal);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    if (getAuthMode() === "supabase" && isAuthError(error)) {
      return jsonError("Your session expired. Please sign in again.", 401);
    }
    if (isMemoryApiError(error)) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Failed to stream assistant output from CortexLTM.", 503, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
