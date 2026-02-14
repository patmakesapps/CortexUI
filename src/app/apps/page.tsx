import { AuthGate } from "@/components/auth/auth-gate";

export default function AppsPage() {
  const requireAuth = (process.env.AUTH_MODE ?? "dev").toLowerCase() === "supabase";
  return <AuthGate requireAuth={requireAuth} view="apps" />;
}
