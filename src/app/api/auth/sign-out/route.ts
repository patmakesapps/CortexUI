import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/server/auth";

export async function POST() {
  const out = NextResponse.json({ ok: true });
  clearSessionCookies(out);
  return out;
}
