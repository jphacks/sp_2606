import "server-only";
import { incidentMode } from "./incident-policy";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { config } from "./server";
export function recoveryConfigured() {
  return (
    incidentMode(process.env) === "none" &&
    !!(
      process.env.SUPABASE_RECOVERY_SECRET_KEY &&
      process.env.RECOVERY_SMTP_HOST &&
      process.env.RECOVERY_SMTP_USER &&
      process.env.RECOVERY_SMTP_PASSWORD &&
      process.env.RECOVERY_MAIL_FROM &&
      ["465", "587"].includes(process.env.RECOVERY_SMTP_PORT || "465")
    )
  );
}
export function recoveryAdmin() {
  const c = config(),
    key = process.env.SUPABASE_RECOVERY_SECRET_KEY;
  if (!recoveryConfigured() || !c || !key)
    throw new Error("recovery_not_configured");
  // Elevated client is restricted to this recovery module and its route.
  return createClient(c.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function sendRecoveryEmail(
  email: string,
  code?: string,
  outcome: "reenrolled" | "disabled" = "reenrolled",
) {
  if (!recoveryConfigured()) throw new Error("recovery_not_configured");
  const port = Number(process.env.RECOVERY_SMTP_PORT || "465");
  const transport = nodemailer.createTransport({
    host: process.env.RECOVERY_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: process.env.RECOVERY_SMTP_USER,
      pass: process.env.RECOVERY_SMTP_PASSWORD,
    },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      from: process.env.RECOVERY_MAIL_FROM,
      to: email,
      subject: code
        ? "CoStep 二要素認証の復旧コード"
        : outcome === "disabled"
          ? "CoStep アカウントの復旧が完了しました"
          : "CoStep 二要素認証の再設定が完了しました",
      text: code
        ? `CoStepの復旧コードは ${code} です。\n10分間有効です。このコードを他の人に教えないでください。\n心当たりがなければ、このメールは無視してください。`
        : outcome === "disabled"
          ? "CoStepのアカウントを復旧し、二要素認証をオフにしました。端末を用意できたら設定から再度有効にできます。\n心当たりがなければ、メールアカウントを保護し、CoStepのパスワードを再設定してください。"
          : "CoStepの二要素認証が新しい認証アプリで再設定されました。\n心当たりがなければ、メールアカウントを保護し、CoStepのパスワードを再設定してください。",
    });
  } finally {
    transport.close();
  }
}
