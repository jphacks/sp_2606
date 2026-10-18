import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authClient,
  currentSession,
  saveSession,
  clearSession,
  validateMutation,
  jsonBody,
} from "@/lib/server";
import {
  recoveryConfigured,
  sendRecoveryEmail,
} from "@/lib/mfa-recovery-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("enroll"),
      password: z.string().min(1).max(128),
      name: z.string().trim().min(1).max(40),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      factorId: z.uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("unenroll"),
      factorId: z.uuid(),
      password: z.string().min(1).max(128),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z.object({ action: z.literal("cancel"), factorId: z.uuid() }).strict(),
]);
export async function GET() {
  try {
    const s = await currentSession(true);
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const { error } = await s.db.rpc("mfa_status");
    if (error)
      return NextResponse.json(
        { error: "二要素認証の準備が完了していません。" },
        { status: 503, headers },
      );
    const capability = await s.db.rpc("mfa_email_recovery_mode");
    return NextResponse.json(
      {
        required: s.mfaRequired,
        recoveryReady:
          recoveryConfigured() && capability.data === "optional_reenroll",
        reenroll: s.mfaReenroll,
        factors: (s.user.factors || [])
          .filter((f) => f.factor_type === "totp")
          .map((f) => ({
            id: f.id,
            name: f.friendly_name || "認証アプリ",
            status: f.status,
          })),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "認証設定を取得できませんでした。" },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    await validateMutation(request, 4096);
    const s = await currentSession(true);
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const parsed = input.safeParse(await jsonBody(request, 4096));
    if (!parsed.success)
      return NextResponse.json(
        { error: "入力内容を確認してください。確認コードは6桁です。" },
        { status: 400, headers },
      );
    const body = parsed.data;
    if (
      s.mfaRequired &&
      body.action !== "verify" &&
      !(
        s.mfaCanEnroll &&
        (body.action === "enroll" || body.action === "cancel")
      )
    )
      return NextResponse.json(
        { error: "先に二要素認証を完了してください。" },
        { status: 403, headers },
      );
    const budget = await s.db.rpc("consume_mfa_attempt", {
      p_action: body.action === "cancel" ? "unenroll" : body.action,
    });
    if (budget.error)
      return NextResponse.json(
        { error: "操作できませんでした。時間をおいて再度お試しください。" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    const factors = (s.user.factors || []).filter(
      (f) => f.factor_type === "totp",
    );
    if (
      body.action !== "enroll" &&
      !factors.some((f) => f.id === body.factorId)
    )
      return NextResponse.json(
        { error: "認証アプリを確認してください。" },
        { status: 403, headers },
      );
    if (body.action === "enroll" || body.action === "unenroll") {
      if (!s.user.email) throw new Error("no_email");
      const verifier = authClient();
      const { data, error } = await verifier.auth.signInWithPassword({
        email: s.user.email,
        password: body.password,
      });
      if (error || data.user?.id !== s.user.id)
        return NextResponse.json(
          { error: "現在のパスワードを確認してください。" },
          { status: 403, headers },
        );
      await verifier.auth.signOut({ scope: "local" });
    }
    const client = authClient();
    const restored = await client.auth.setSession({
      access_token: s.token,
      refresh_token: s.refreshToken,
    });
    if (restored.error) throw restored.error;
    if (body.action === "enroll") {
      const capability = await s.db.rpc("mfa_email_recovery_mode");
      if (!recoveryConfigured() || capability.data !== "optional_reenroll")
        return NextResponse.json(
          {
            error:
              "メール復旧の準備が完了していないため、まだ有効化できません。",
          },
          { status: 503, headers },
        );
      if (
        factors.filter((f) => f.status === "verified").length >= 2 ||
        factors.some((f) => f.status === "unverified")
      )
        return NextResponse.json(
          {
            error:
              "登録途中の認証アプリを取り消すか、既存の登録を確認してください。登録は2つまでです。",
          },
          { status: 409, headers },
        );
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: body.name,
        issuer: "CoStep",
      });
      if (error) throw error;
      // Never embed upstream SVG as executable markup.
      return NextResponse.json(
        { id: data.id, secret: data.totp.secret, qr: data.totp.qr_code },
        { headers },
      );
    }
    if (body.action === "cancel") {
      if (
        !factors.some(
          (f) => f.id === body.factorId && f.status === "unverified",
        )
      )
        return NextResponse.json(
          { error: "有効な認証アプリは確認なしで解除できません。" },
          { status: 403, headers },
        );
    } else {
      const { data, error } = await client.auth.mfa.challengeAndVerify({
        factorId: body.factorId,
        code: body.code,
      });
      if (error || !data)
        return NextResponse.json(
          { error: "確認コードが正しくないか、期限切れです。" },
          { status: 400, headers },
        );
      await saveSession(
        {
          ...data,
          expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        },
        s.created,
      );
      if (body.action === "verify") {
        if (s.mfaReenroll) {
          const completed = await client.rpc("complete_mfa_reenrollment");
          if (completed.error) throw completed.error;
          if (s.user.email) {
            try {
              await sendRecoveryEmail(s.user.email);
            } catch {
              return NextResponse.json(
                {
                  ok: true,
                  warning:
                    "再登録は完了しましたが、通知メールを送れませんでした。",
                },
                { headers },
              );
            }
          }
        }
        return NextResponse.json({ ok: true }, { headers });
      }
    }
    const { error } = await client.auth.mfa.unenroll({
      factorId: body.factorId,
    });
    if (error) throw error;
    if (body.action === "unenroll") {
      await client.auth.signOut({ scope: "local" });
      await clearSession();
    }
    return NextResponse.json(
      { ok: true, signedOut: body.action === "unenroll" },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "認証の操作を完了できませんでした。時間をおいて再度お試しください。",
      },
      { status: 400, headers },
    );
  }
}
