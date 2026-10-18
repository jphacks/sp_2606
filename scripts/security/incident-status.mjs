import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const mode = process.env.COSTEP_INCIDENT_MODE?.trim() || "none";
const valid = ["none", "recovery", "all"].includes(mode);
const cutoff = process.env.SESSION_NOT_BEFORE?.trim();
const cutoffValid =
  !cutoff ||
  (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(cutoff) &&
    Number.isFinite(Date.parse(cutoff)));
console.log(
  JSON.stringify(
    {
      environment: "local process only; not proof of Vercel deployment",
      mode: valid ? mode : "invalid (fail closed: all)",
      cutoffConfigured: !!cutoff,
      cutoffValid,
      recoveryAdminKeyConfigured: !!process.env.SUPABASE_RECOVERY_SECRET_KEY,
      recoverySmtpConfigured: !!process.env.RECOVERY_SMTP_PASSWORD,
      sessionKeyConfigured: !!process.env.SESSION_ENCRYPTION_KEY,
    },
    null,
    2,
  ),
);
if (!valid || !cutoffValid) process.exitCode = 1;
