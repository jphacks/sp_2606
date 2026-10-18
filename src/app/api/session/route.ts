import { NextResponse } from "next/server";
import { config, currentSession, csrf, canRecover } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const token = await csrf();
  try {
    const session = await currentSession(true);
    return NextResponse.json(
      {
        configured: !!config(),
        signup_enabled: process.env.ALLOW_SIGNUP === "true",
        user: session && !session.mfaRequired ? { id: session.user.id } : null,
        mfa_reenroll: session?.mfaReenroll ?? false,
        mfa_can_enroll: session?.mfaCanEnroll ?? false,
        mfa_required: session?.mfaRequired ?? false,
        mfa_factors: session?.mfaRequired
          ? (session.user.factors || [])
              .filter(
                (f) => f.status === "verified" && f.factor_type === "totp",
              )
              .map((f) => ({ id: f.id, name: f.friendly_name || "認証アプリ" }))
          : [],
        recoveryUser:
          session && (await canRecover(session.user.id, session.token))
            ? { id: session.user.id }
            : null,
        recoveryAuthorized: session
          ? await canRecover(session.user.id, session.token)
          : false,
        csrf: token,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error: "接続を確認できませんでした。設定と通信を確認してください。",
        csrf: token,
      },
      { status: 503 },
    );
  }
}
