import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type {
  BuildMemoryContextParams,
  ContextMessage,
  ThreadRecord,
  UIMessage
} from "@/lib/memory/types";

type JsonRecord = Record<string, unknown>;

export class MemoryApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MemoryApiError";
    this.status = status;
  }
}

export class CortexHttpProvider implements MemoryProvider {
  private readonly baseUrl: string;
  private readonly agentBaseUrl: string | null;
  private readonly apiKey: string | null;
  private readonly authorization: string | null;

  constructor(options?: { authorization?: string | null }) {
    const configured = process.env.CORTEX_API_BASE_URL ?? "http://127.0.0.1:8000";
    this.baseUrl = normalizeBaseUrl(configured, "http://127.0.0.1:8000");
    const agentEnabled = (process.env.CORTEX_AGENT_ENABLED ?? "true")
      .trim()
      .toLowerCase() === "true";
    const configuredAgent = process.env.CORTEX_AGENT_BASE_URL ?? "http://127.0.0.1:8010";
    this.agentBaseUrl = agentEnabled
      ? normalizeBaseUrl(configuredAgent, "http://127.0.0.1:8010")
      : null;
    this.apiKey = process.env.CORTEX_API_KEY ?? null;
    this.authorization = options?.authorization ?? null;
  }

  async startThread(userId: string, title?: string): Promise<string> {
    const payload = await this.requestJson<{ thread_id: string }>(
      "/v1/threads",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          ...(title ? { title } : {})
        })
      }
    );
    if (!payload.thread_id) throw new Error("Missing thread_id from memory API.");
    return payload.thread_id;
  }

  async chat(
    threadId: string,
    text: string,
    signal?: AbortSignal
  ): Promise<Response> {
    const headers = this.createHeaders();
    const useAgent = Boolean(this.agentBaseUrl);
    const primaryUrl = useAgent
      ? `${this.agentBaseUrl}/v1/agent/threads/${encodeURIComponent(threadId)}/chat`
      : `${this.baseUrl}/v1/threads/${encodeURIComponent(threadId)}/chat`;
    const fallbackUrl = `${this.baseUrl}/v1/threads/${encodeURIComponent(threadId)}/chat`;
    let response: Response;
    let routeMode: "agent" | "agent_fallback" | "memory_direct" = useAgent
      ? "agent"
      : "memory_direct";
    let routeWarning: string | null = null;

    try {
      response = await fetch(primaryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
        signal
      });
    } catch (error) {
      if (!useAgent) {
        throw new MemoryApiError(
          `Memory API chat request failed for ${primaryUrl}: ${
            error instanceof Error ? error.message : "fetch failed"
          }`,
          503
        );
      }
      try {
        response = await fetch(fallbackUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ text }),
          signal
        });
        routeMode = "agent_fallback";
        routeWarning = `CortexAgent was unreachable at ${primaryUrl}; used CortexLTM direct route instead.`;
      } catch (fallbackError) {
        throw new MemoryApiError(
          `Chat routing failed for agent ${primaryUrl} and fallback ${fallbackUrl}: ${
            fallbackError instanceof Error ? fallbackError.message : "fetch failed"
          }`,
          503
        );
      }
    }

    if (
      useAgent &&
      response &&
      !response.ok &&
      shouldFallbackToBaseFromAgent(response.status)
    ) {
      const agentStatus = response.status;
      try {
        response = await fetch(fallbackUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ text }),
          signal
        });
        routeMode = "agent_fallback";
        routeWarning = `CortexAgent returned ${agentStatus}; used CortexLTM direct route instead.`;
      } catch (error) {
        throw new MemoryApiError(
          `Agent chat failed with status ${agentStatus} and fallback ${fallbackUrl} was unreachable: ${
            error instanceof Error ? error.message : "fetch failed"
          }`,
          503
        );
      }
    }

    if (!response.ok) {
      const textBody = await response.text();
      let payload: JsonRecord | null = null;
      if (textBody) {
        try {
          payload = JSON.parse(textBody) as JsonRecord;
        } catch {
          payload = null;
        }
      }
      const message =
        readErrorMessage(payload) ??
        (textBody ||
          `Memory API chat request failed with status ${response.status}.`);
      throw new MemoryApiError(message, response.status);
    }

    if (routeMode === "agent_fallback" && isToolIntent(text)) {
      const outHeaders = new Headers({
        "Content-Type": "text/plain; charset=utf-8"
      });
      outHeaders.set("x-cortex-route-mode", routeMode);
      if (routeWarning) {
        outHeaders.set("x-cortex-route-warning", sanitizeHeaderValue(routeWarning));
      }
      return new Response(buildToolFallbackMessage(text), {
        status: 200,
        headers: outHeaders
      });
    }

    if (useAgent && isJsonResponse(response)) {
      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      const assistantText =
        typeof payload.response === "string" ? payload.response : "";
      const traceHeader = buildAgentTraceHeader(payload);
      const outHeaders = new Headers({
        "Content-Type": "text/plain; charset=utf-8"
      });
      outHeaders.set("x-cortex-route-mode", routeMode);
      if (routeWarning) {
        outHeaders.set("x-cortex-route-warning", sanitizeHeaderValue(routeWarning));
      }
      if (traceHeader) {
        outHeaders.set("x-cortex-agent-trace", traceHeader);
      }
      return new Response(assistantText, {
        status: 200,
        headers: outHeaders
      });
    }

    const passthroughHeaders = new Headers(response.headers);
    passthroughHeaders.set("x-cortex-route-mode", routeMode);
    if (routeWarning) {
      passthroughHeaders.set("x-cortex-route-warning", sanitizeHeaderValue(routeWarning));
    }
    return new Response(response.body, {
      status: response.status,
      headers: passthroughHeaders
    });
  }

  async listThreads(userId: string, limit = 50): Promise<ThreadRecord[]> {
    const params = new URLSearchParams({
      user_id: userId,
      limit: String(limit)
    });
    const payload = await this.requestJson<{ threads?: JsonRecord[] }>(
      `/v1/threads?${params.toString()}`,
      { method: "GET" }
    );
    return (payload.threads ?? []).map((row) => ({
      id: String(row.id ?? ""),
      userId: String(row.user_id ?? userId),
      title: typeof row.title === "string" ? row.title : null,
      createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString(),
      isCoreMemory: Boolean(row.is_core_memory)
    }));
  }

  async renameThread(threadId: string, title: string): Promise<void> {
    await this.requestJson(
      `/v1/threads/${encodeURIComponent(threadId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title })
      }
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.requestJson(`/v1/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE"
    });
  }

  async promoteThreadToCoreMemory(
    threadId: string
  ): Promise<{ summary: string | null; summaryUpdated: boolean; isCoreMemory: boolean }> {
    const payload = await this.requestJson<{
      summary?: unknown;
      summary_updated?: unknown;
      is_core_memory?: unknown;
    }>(`/v1/threads/${encodeURIComponent(threadId)}/promote-core-memory`, {
      method: "POST"
    });
    return {
      summary: typeof payload.summary === "string" ? payload.summary : null,
      summaryUpdated: Boolean(payload.summary_updated),
      isCoreMemory: Boolean(payload.is_core_memory)
    };
  }

  async addUserEvent(
    threadId: string,
    text: string,
    meta?: Record<string, unknown>
  ): Promise<string> {
    return this.addEvent(threadId, "user", text, meta);
  }

  async addAssistantEvent(
    threadId: string,
    text: string,
    meta?: Record<string, unknown>
  ): Promise<string> {
    return this.addEvent(threadId, "assistant", text, meta);
  }

  async setEventReaction(
    threadId: string,
    eventId: string,
    reaction: "thumbs_up" | "heart" | "angry" | "sad" | "brain" | null
  ): Promise<{ reaction: string | null; summaryUpdated: boolean }> {
    const payload = await this.requestJson<{
      reaction?: unknown;
      summary_updated?: unknown;
    }>(
      `/v1/threads/${encodeURIComponent(threadId)}/events/${encodeURIComponent(eventId)}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ reaction })
      }
    );

    return {
      reaction: typeof payload.reaction === "string" ? payload.reaction : null,
      summaryUpdated: Boolean(payload.summary_updated)
    };
  }

  async buildMemoryContext(
    params: BuildMemoryContextParams
  ): Promise<ContextMessage[]> {
    const payload = await this.requestJson<{ messages?: JsonRecord[] }>(
      `/v1/threads/${encodeURIComponent(params.threadId)}/memory-context`,
      {
        method: "POST",
        body: JSON.stringify({
          latest_user_text: params.latestUserText,
          short_term_limit: params.shortTermLimit ?? 30
        })
      }
    );

    return (payload.messages ?? [])
      .map((message) => ({
        role: message.role,
        content: message.content
      }))
      .filter(
        (
          message
        ): message is ContextMessage =>
          (message.role === "system" ||
            message.role === "user" ||
            message.role === "assistant") &&
          typeof message.content === "string"
      );
  }

  async getRecentEvents(threadId: string, limit = 30): Promise<UIMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const payload = await this.requestJson<{ messages?: JsonRecord[] }>(
      `/v1/threads/${encodeURIComponent(threadId)}/events?${params.toString()}`,
      { method: "GET" }
    );

    const out: UIMessage[] = [];
    for (const row of payload.messages ?? []) {
      const role = row.role;
      const content = row.content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        continue;
      }
      out.push({
        id: String(row.id ?? ""),
        threadId: String(row.thread_id ?? threadId),
        role,
        content,
        createdAt: new Date(
          String(row.created_at ?? new Date().toISOString())
        ).toISOString(),
        ...(isRecord(row.meta) ? { meta: row.meta } : {})
      });
    }
    return out;
  }

  async getActiveSummary(threadId: string): Promise<string | null> {
    const payload = await this.requestJson<{ summary?: unknown }>(
      `/v1/threads/${encodeURIComponent(threadId)}/summary`,
      { method: "GET" }
    );
    return typeof payload.summary === "string" && payload.summary.trim().length > 0
      ? payload.summary.trim()
      : null;
  }

  private async addEvent(
    threadId: string,
    actor: "user" | "assistant",
    content: string,
    meta?: Record<string, unknown>
  ): Promise<string> {
    const payload = await this.requestJson<{ event_id: string }>(
      `/v1/threads/${encodeURIComponent(threadId)}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          actor,
          content,
          meta: meta ?? {}
        })
      }
    );
    if (!payload.event_id) throw new Error("Missing event_id from memory API.");
    return payload.event_id;
  }

  private async requestJson<T>(
    path: string,
    init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {}
  ): Promise<T> {
    const headers = this.createHeaders(init.headers);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    const text = await response.text();
    let payload: JsonRecord | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as JsonRecord;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message =
        readErrorMessage(payload) ??
        `Memory API request failed with status ${response.status}.`;
      throw new MemoryApiError(message, response.status);
    }

    return (payload ?? {}) as T;
  }

  private createHeaders(existing?: HeadersInit): Headers {
    const headers = new Headers(existing ?? {});
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.apiKey) {
      headers.set("x-api-key", this.apiKey);
    }
    if (this.authorization && !headers.has("Authorization")) {
      headers.set("Authorization", this.authorization);
    }
    return headers;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorMessage(payload: JsonRecord | null): string | null {
  if (!payload) return null;
  const nested = payload.error;
  if (isRecord(nested) && typeof nested.message === "string") {
    return nested.message;
  }
  if (typeof payload.detail === "string") return payload.detail;
  return null;
}

function isJsonResponse(response: Response): boolean {
  const value = response.headers.get("Content-Type") ?? "";
  return value.toLowerCase().includes("application/json");
}

function shouldFallbackToBaseFromAgent(status: number): boolean {
  return status === 404 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isToolIntent(text: string): boolean {
  const lowered = (text || "").trim().toLowerCase();
  if (!lowered) return false;
  const gmailPattern =
    /\b(gmail|gmial|email|emails|emial|emials|inbox|unread|thread|draft|send email|send an email)\b/;
  return (
    gmailPattern.test(lowered) ||
    /\b(calendar|event|meeting|schedule|appointment)\b/.test(lowered) ||
    /\b(google drive|drive file|drive folder|docs|sheets|slides)\b/.test(lowered) ||
    /\b(web search|search the web|look up online|find online)\b/.test(lowered)
  );
}

function buildToolFallbackMessage(text: string): string {
  const lowered = (text || "").trim().toLowerCase();
  let toolLabel = "agent tools";
  if (
    /\b(gmail|gmial|email|emails|emial|emials|inbox|unread|thread|draft|send email|send an email)\b/.test(
      lowered
    )
  ) {
    toolLabel = "Gmail";
  } else if (/\b(calendar|event|meeting|schedule|appointment)\b/.test(lowered)) {
    toolLabel = "Google Calendar";
  } else if (/\b(google drive|drive file|drive folder|docs|sheets|slides)\b/.test(lowered)) {
    toolLabel = "Google Drive";
  } else if (/\b(web search|search the web|look up online|find online)\b/.test(lowered)) {
    toolLabel = "web search";
  }
  return `CortexAgent is unavailable right now, so I cannot run ${toolLabel}. I stopped here to avoid guessing. Please retry in a moment.`;
}

function buildAgentTraceHeader(payload: JsonRecord): string | null {
  const decision = isRecord(payload.decision) ? payload.decision : null;
  const action = typeof decision?.action === "string" ? decision.action.trim() : "";
  if (!action) return null;
  const reason = typeof decision?.reason === "string" ? decision.reason.trim() : "";
  const confidenceRaw = decision?.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : null;
  const capabilities = inferCapabilitiesFromPayload(payload, action);
  const steps = inferPipelineStepsFromPayload(payload);
  const trace = {
    version: 1,
    source: "cortex-agent",
    action,
    ...(reason ? { reason } : {}),
    ...(confidence !== null ? { confidence } : {}),
    capabilities,
    ...(steps.length > 0 ? { steps } : {})
  };
  return JSON.stringify(trace);
}

function inferPipelineStepsFromPayload(
  payload: JsonRecord
): Array<{ action: string; toolName: string; success: boolean; reason: string }> {
  const raw = payload.tool_pipeline;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ action: string; toolName: string; success: boolean; reason: string }> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const action = typeof item.action === "string" ? item.action.trim() : "";
    const toolName = typeof item.tool_name === "string" ? item.tool_name.trim() : "";
    const success = typeof item.success === "boolean" ? item.success : null;
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!action || !toolName || success === null) continue;
    out.push({ action, toolName, success, reason });
  }
  return out;
}

function inferCapabilitiesFromPayload(
  payload: JsonRecord,
  action: string
): Array<{ id: string; type: "tool"; label: string }> {
  const out: Array<{ id: string; type: "tool"; label: string }> = [];
  if (action === "web_search") {
    out.push({ id: "web_search", type: "tool", label: "Web Search" });
  } else if (action === "google_calendar") {
    out.push({ id: "google_calendar", type: "tool", label: "Google Calendar" });
  } else if (action === "google_gmail") {
    out.push({ id: "google_gmail", type: "tool", label: "Gmail" });
  } else if (action === "google_drive") {
    out.push({ id: "google_drive", type: "tool", label: "Google Drive" });
  } else if (action === "orchestration") {
    const pipeline = payload.tool_pipeline;
    if (Array.isArray(pipeline)) {
      const seen = new Set<string>();
      for (const step of pipeline) {
        if (!isRecord(step)) continue;
        const stepAction =
          typeof step.action === "string" ? step.action.trim().toLowerCase() : "";
        if (!stepAction || seen.has(stepAction)) continue;
        seen.add(stepAction);
        out.push({
          id: stepAction,
          type: "tool",
          label:
            stepAction === "google_calendar"
              ? "Google Calendar"
              : stepAction === "google_gmail"
                ? "Gmail"
                : stepAction === "google_drive"
                  ? "Google Drive"
                  : stepAction === "web_search"
                    ? "Web Search"
                    : stepAction.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
        });
      }
    }
  }
  const sources = payload.sources;
  if (Array.isArray(sources) && sources.length > 0 && out.length === 0) {
    out.push({ id: "external_sources", type: "tool", label: "External Sources" });
  }
  return out;
}

function normalizeBaseUrl(raw: string, fallback: string): string {
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "");
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    return cleaned.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 240);
}
