import { NextRequest } from "next/server";
import { getAuthFromRequest, getAuthMode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return Response.json({ provider: "google", connected: false, disabled: true });
  }
  const { authorization } = getAuthFromRequest(req);
  if (!authorization) {
    return jsonError("Sign in is required.", 401);
  }

  const agentBase = (process.env.CORTEX_AGENT_BASE_URL ?? "http://127.0.0.1:8010")
    .trim()
    .replace(/\/+$/, "");

  try {
    const res = await fetch(`${agentBase}/v1/agent/integrations/google/status`, {
      method: "GET",
      headers: {
        Authorization: authorization
      },
      cache: "no-store"
    });
    const payload = (await res.json().catch(() => null)) as
      | { provider?: string; connected?: boolean; detail?: string }
      | null;
    if (!res.ok) {
      return jsonError(payload?.detail ?? `upstream_${res.status}`, res.status);
    }
    return Response.json({
      provider: payload?.provider ?? "google",
      connected: Boolean(payload?.connected)
    });
  } catch {
    return jsonError("agent_unreachable", 503);
  }
}
