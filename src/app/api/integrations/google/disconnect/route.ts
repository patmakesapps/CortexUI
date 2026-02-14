import { NextRequest } from "next/server";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return jsonError("Supabase auth mode is disabled.", 400);
  }
  const { authorization } = getAuthFromRequest(req);
  if (!authorization) {
    return jsonError("Sign in is required.", 401);
  }

  const agentBase = (process.env.CORTEX_AGENT_BASE_URL ?? "http://127.0.0.1:8010")
    .trim()
    .replace(/\/+$/, "");
  try {
    const res = await fetch(`${agentBase}/v1/agent/integrations/google/disconnect`, {
      method: "POST",
      headers: {
        Authorization: authorization
      },
      cache: "no-store"
    });
    const payload = (await res.json().catch(() => null)) as
      | { detail?: string; disconnected?: boolean; provider?: string }
      | null;
    if (!res.ok) {
      return jsonError(payload?.detail ?? `upstream_${res.status}`, res.status);
    }
    return Response.json({
      provider: payload?.provider ?? "google",
      disconnected: Boolean(payload?.disconnected)
    });
  } catch {
    return jsonError("agent_unreachable", 503);
  }
}
