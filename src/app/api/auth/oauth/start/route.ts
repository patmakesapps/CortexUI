import { NextRequest, NextResponse } from "next/server";
import { getAuthMode, getSupabaseConfig, resolveAppOrigin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

const SUPPORTED_PROVIDERS = new Set(["google", "github"]);

export async function POST(req: NextRequest) {
  if (getAuthMode() !== "supabase") {
    return jsonError("Supabase auth mode is disabled.", 400);
  }

  const body = (await req.json().catch(() => null)) as
    | { provider?: string }
    | null;
  const provider = (body?.provider ?? "").toLowerCase().trim();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return jsonError("Unsupported OAuth provider.", 422);
  }

  let url: string;
  try {
    ({ url } = getSupabaseConfig());
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Supabase auth is not configured for this environment.",
      503
    );
  }
  const redirectTo = `${resolveAppOrigin(req)}/auth/callback`;
  const authorizeUrl =
    `${url}/auth/v1/authorize` +
    `?provider=${encodeURIComponent(provider)}` +
    `&redirect_to=${encodeURIComponent(redirectTo)}`;

  return NextResponse.json({ ok: true, url: authorizeUrl });
}
