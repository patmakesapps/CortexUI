import { createHash, randomUUID } from "crypto";
import type { NextRequest } from "next/server";

export function resolveStableUserId(req: NextRequest): string {
  const directUserId = req.headers.get("x-user-id");
  if (directUserId) return normalizeAsUuid(directUserId);

  const authSubject = req.headers.get("x-auth-sub");
  if (authSubject) return hashToUuid(authSubject);

  const cookieUser = req.cookies.get("cortex_user_id")?.value;
  if (cookieUser) return normalizeAsUuid(cookieUser);

  return randomUUID();
}

function normalizeAsUuid(input: string): string {
  const trimmed = input.trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    );
  if (isUuid) return trimmed.toLowerCase();
  return hashToUuid(trimmed);
}

function hashToUuid(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32)
  ].join("-");
}
