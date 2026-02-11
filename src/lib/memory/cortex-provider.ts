import { randomUUID } from "crypto";
import type { QueryResult } from "pg";
import type { MemoryProvider } from "@/lib/memory/memory-provider";
import type {
  BuildMemoryContextParams,
  ContextMessage,
  ThreadRecord,
  UIMessage
} from "@/lib/memory/types";
import { getDbPool } from "@/lib/server/db";

const SUMMARY_CUE_REGEX =
  /\b(recap|summari[sz]e|catch me up|where were we|continue)\b/i;
const SEMANTIC_CUE_REGEX =
  /\b(remember|what did i say|what was the plan|who am i|my name)\b/i;

export class CortexProvider implements MemoryProvider {
  async startThread(userId: string, title?: string): Promise<string> {
    const id = randomUUID();
    await getDbPool().query(
      `insert into ltm_threads (id, user_id, title)
       values ($1, $2, $3)`,
      [id, userId, title ?? null]
    );
    return id;
  }

  async listThreads(userId: string, limit = 50): Promise<ThreadRecord[]> {
    const result = await getDbPool().query(
      `select id, user_id, title, created_at
       from ltm_threads
       where user_id = $1
       order by created_at desc
       limit $2`,
      [userId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: new Date(row.created_at).toISOString()
    }));
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

  async getRecentEvents(threadId: string, limit = 30): Promise<UIMessage[]> {
    const result = await getDbPool().query(
      `select id, thread_id, actor, content, meta, created_at
       from ltm_events
       where thread_id = $1
       order by created_at desc
       limit $2`,
      [threadId, limit]
    );

    return result.rows
      .reverse()
      .filter((row) => row.actor === "user" || row.actor === "assistant")
      .map((row) => ({
        id: row.id,
        threadId: row.thread_id,
        role: row.actor,
        content: row.content,
        createdAt: new Date(row.created_at).toISOString(),
        meta: row.meta ?? undefined
      }));
  }

  async getActiveSummary(threadId: string): Promise<string | null> {
    const pool = getDbPool();
    for (const sql of summaryQueries()) {
      try {
        const result = await pool.query(sql, [threadId]);
        const summary = result.rows[0]?.summary;
        if (typeof summary === "string" && summary.trim().length > 0) {
          return summary.trim();
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  async buildMemoryContext(
    params: BuildMemoryContextParams
  ): Promise<ContextMessage[]> {
    const context: ContextMessage[] = [];

    if (SUMMARY_CUE_REGEX.test(params.latestUserText)) {
      const summary = await this.getActiveSummary(params.threadId);
      if (summary) {
        context.push({
          role: "system",
          content: `Active summary:\n${summary}`
        });
      }
    }

    if (SEMANTIC_CUE_REGEX.test(params.latestUserText)) {
      const semanticMemories = await this.getSemanticMemories(params.threadId, 5);
      if (semanticMemories.length > 0) {
        context.push({
          role: "system",
          content: `Relevant long-term memory:\n${semanticMemories.join("\n- ")}`
        });
      }
    }

    const shortTerm = await this.getRecentEvents(
      params.threadId,
      params.shortTermLimit ?? 30
    );
    for (const message of shortTerm) {
      context.push({
        role: message.role,
        content: message.content
      });
    }

    return context;
  }

  private async addEvent(
    threadId: string,
    actor: "user" | "assistant",
    content: string,
    meta?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    await getDbPool().query(
      `insert into ltm_events (id, thread_id, actor, content, meta)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [id, threadId, actor, content, JSON.stringify(meta ?? {})]
    );
    return id;
  }

  private async getSemanticMemories(
    threadId: string,
    limit: number
  ): Promise<string[]> {
    const pool = getDbPool();
    for (const sql of semanticQueries()) {
      try {
        const result: QueryResult = await pool.query(sql, [threadId, limit]);
        const values = result.rows
          .map((row) => row.content ?? row.memory ?? row.value)
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
        if (values.length > 0) return values;
      } catch {
        continue;
      }
    }
    return [];
  }
}

function summaryQueries(): string[] {
  return [
    `select summary
     from ltm_thread_summaries
     where thread_id = $1
       and is_active = true
     order by updated_at desc
     limit 1`,
    `select summary
     from ltm_thread_summaries
     where thread_id = $1
     order by created_at desc
     limit 1`
  ];
}

function semanticQueries(): string[] {
  return [
    `select content
     from ltm_master_items
     where user_id = (select user_id from ltm_threads where id = $1)
     order by updated_at desc
     limit $2`,
    `select content
     from ltm_memories
     where thread_id = $1
     order by created_at desc
     limit $2`,
    `select content
     from ltm_events
     where thread_id = $1
       and embedding is not null
     order by created_at desc
     limit $2`
  ];
}
