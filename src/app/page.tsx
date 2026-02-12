import { AuthGate } from "@/components/auth/auth-gate";

export default function HomePage() {
  const requireAuth = (process.env.AUTH_MODE ?? "dev").toLowerCase() === "supabase";
  return <AuthGate requireAuth={requireAuth} />;
}
