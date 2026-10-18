import { NextResponse } from "next/server";
import { config, currentSession, csrf, canRecover } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const token = await csrf();
  try {
    const session = await currentSession();
    return NextResponse.json(
      {
        configured: !!config(),
        signup_enabled: process.env.ALLOW_SIGNUP === "true",
        user: session ? { id: session.user.id } : null,
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
