import "server-only";
import { createClient } from "@supabase/supabase-js";
export type MonitorScope = "login" | "password_email" | "mfa" | "mfa_recovery";
export function monitorStore() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_RECOVERY_SECRET_KEY;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key)
    throw new Error("monitor_not_configured");
  // Existing server-only admin key: monitoring is limited here to aggregate RPCs.
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function recordSecurityResult(
  scope: MonitorScope,
  status: number,
) {
  if (process.env.SECURITY_METRICS_ENABLED !== "true") return;
  const outcome = status >= 500 ? "error" : status >= 400 ? "rejected" : "ok";
  try {
    const result = await monitorStore()
      .rpc("record_security_metric", { p_scope: scope, p_outcome: outcome })
      .abortSignal(AbortSignal.timeout(1500));
    if (result.error) throw new Error("metric_write_failed");
  } catch {
    // Deliberately exclude error messages, URLs, user identity and request data.
    console.warn(JSON.stringify({ type: "costep_monitor_unavailable", scope }));
  }
  if (outcome !== "ok")
    console.warn(
      JSON.stringify({ type: "costep_security_event", scope, outcome }),
    );
}
