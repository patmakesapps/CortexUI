import { NextRequest } from "next/server";
import { getLlmProvider, getMemoryProvider } from "@/lib/server/providers";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 6000;

type MessagePayload = {
  text?: string;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await ctx.params;
  if (!threadId) return jsonError("threadId is required.", 400);

  try {
    const memory = getMemoryProvider();
    const messages = await memory.getRecentEvents(threadId, 100);
    return Response.json({ threadId, messages });
  } catch (error) {
    return jsonError("Failed to fetch messages.", 500, {
      cause: error instanceof Error ? error.message : "unknown"
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
  const memory = getMemoryProvider();

  if (demoMode) {
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
    return jsonError("Failed to stream assistant output from CortexLTM.", 500, {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}
