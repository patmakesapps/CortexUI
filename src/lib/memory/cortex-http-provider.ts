import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type {
  BuildMemoryContextParams,
  ContextMessage,
  ThreadRecord,
  UIMessage
} from "@/lib/memory/types";

type JsonRecord = Record<string, unknown>;

export class CortexHttpProvider implements MemoryProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly authorization: string | null;

  constructor(options?: { authorization?: string | null }) {
    const configured = process.env.CORTEX_API_BASE_URL ?? "http://127.0.0.1:8000";
    this.baseUrl = configured.replace(/\/+$/, "");
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
    const response = await fetch(
      `${this.baseUrl}/v1/threads/${encodeURIComponent(threadId)}/chat`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
        signal
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        detail || `Memory API chat request failed with status ${response.status}.`
      );
    }

    return response;
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
      createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString()
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
      throw new Error(message);
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
