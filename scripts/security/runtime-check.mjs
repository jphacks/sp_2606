import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function assessMetrics(value) {
  const scopes = ["login", "password_email", "mfa", "mfa_recovery"],
    outcomes = ["ok", "rejected", "error"];
  if (
    !value ||
    value.version !== 1 ||
    value.window_minutes !== 30 ||
    !Array.isArray(value.counts) ||
    value.counts.length > 12
  )
    throw new Error("invalid_metrics");
  const metrics = Object.fromEntries(
    scopes.map((s) => [s, { ok: 0, rejected: 0, error: 0 }]),
  );
  const seen = new Set();
  for (const row of value.counts) {
    if (
      !scopes.includes(row.scope) ||
      !outcomes.includes(row.outcome) ||
      !Number.isSafeInteger(row.total) ||
      row.total < 0 ||
      row.total > 31_000_000 ||
      seen.has(row.scope + row.outcome)
    )
      throw new Error("invalid_metrics");
    seen.add(row.scope + row.outcome);
    metrics[row.scope][row.outcome] = row.total;
  }
  const alerts = [];
  const login = metrics.login,
    loginTotal = login.ok + login.rejected + login.error;
  if (login.rejected >= 30 && login.rejected / Math.max(1, loginTotal) >= 0.7)
    alerts.push("login_rejections");
  if (metrics.mfa.rejected >= 20) alerts.push("mfa_rejections");
  if (Object.values(metrics.password_email).reduce((a, b) => a + b, 0) >= 15)
    alerts.push("password_email_volume");
  if (Object.values(metrics.mfa_recovery).reduce((a, b) => a + b, 0) >= 15)
    alerts.push("mfa_recovery_volume");
  if (scopes.reduce((n, s) => n + metrics[s].error, 0) >= 5)
    alerts.push("server_errors");
  return { version: 1, window_minutes: 30, alerts };
}
async function check() {
  const oidcUrl = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "");
  if (
    oidcUrl.protocol !== "https:" ||
    !oidcUrl.hostname.endsWith(".actions.githubusercontent.com") ||
    oidcUrl.username ||
    oidcUrl.password ||
    oidcUrl.port
  )
    throw new Error("invalid_oidc_provider");
  oidcUrl.searchParams.set("audience", "costep-security-monitor");
  const auth = await fetch(oidcUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
  });
  if (!auth.ok) throw new Error("oidc_failed");
  const { value: token } = await auth.json();
  if (typeof token !== "string" || token.length > 16000)
    throw new Error("oidc_failed");
  const res = await fetch(
    "https://study-circle-pi.vercel.app/api/security-monitor",
    {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    console.warn(
      JSON.stringify({ diagnostic: "monitor_http", status: res.status }),
    );
    if (res.status === 401) {
      const p = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      );
      console.warn(
        JSON.stringify({
          diagnostic: "claim_comparison",
          issuer: p.iss === "https://token.actions.githubusercontent.com",
          audience: p.aud === "costep-security-monitor",
          repository: p.repository === "jphacks/sp_2606",
          repositoryId: p.repository_id === "1400418256",
          ownerId: p.repository_owner_id === "10176253",
          branch: p.ref === "refs/heads/main",
          workflow:
            p.workflow_ref ===
            "jphacks/sp_2606/.github/workflows/runtime-monitor.yml@refs/heads/main",
          subject: p.sub === "repo:jphacks/sp_2606:ref:refs/heads/main",
          event: ["schedule", "workflow_dispatch"].includes(p.event_name),
        }),
      );
    }
    throw new Error("monitor_unavailable");
  }
  const text = await res.text();
  if (text.length > 10000) throw new Error("invalid_metrics");
  return assessMetrics(JSON.parse(text));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let result;
  try {
    result = await check();
  } catch (error) {
    const allowed = [
      "invalid_oidc_provider",
      "oidc_failed",
      "monitor_unavailable",
      "invalid_metrics",
    ];
    console.warn(
      JSON.stringify({
        diagnostic: allowed.includes(error?.message)
          ? error.message
          : "monitor_check_failed",
      }),
    );
    result = {
      version: 1,
      window_minutes: 30,
      alerts: ["monitor_unavailable"],
    };
  }
  writeFileSync(process.argv[2], JSON.stringify(result), { mode: 0o600 });
  console.log(JSON.stringify(result));
  if (result.alerts.length) process.exitCode = 1;
}
