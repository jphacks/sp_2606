import { recordSecurityResult } from "@/lib/security-monitor";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authClient,
  config,
  currentSession,
  saveSession,
  validateMutation,
  jsonBody,
} from "@/lib/server";
import { newRecoveryCode, recoveryCodeHash } from "@/lib/mfa-recovery-code";
import {
  recoveryAdmin,
  recoveryConfigured,
  sendRecoveryEmail,
} from "@/lib/mfa-recovery-server";
import {
  setMfaRecoveryCookie,
  readMfaRecoveryCookie,
  clearMfaRecoveryCookie,
} from "@/lib/mfa-recovery-cookie";
const headers = { "Cache-Control": "private, no-store" };
const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("send"), password: z.string().min(1).max(128) })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      password: z.string().min(1).max(128),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
]);
async function handlePOST(request: Request) {
  try {
    await validateMutation(request, 4096);
    const s = await currentSession(true);
    if (!s || !s.user.email)
      return NextResponse.json(
        { error: "メール・パスワードでログインしてから復旧してください。" },
        { status: 401, headers },
      );
    if (!recoveryConfigured())
      return NextResponse.json(
        { error: "メール復旧の準備が完了していません。" },
        { status: 503, headers },
      );
    const capability = await s.db.rpc("mfa_email_recovery_mode");
    if (capability.error || capability.data !== "optional_reenroll")
      return NextResponse.json(
        { error: "復旧機能を更新中です。少し待ってから再度お試しください。" },
        { status: 503, headers },
      );
    const body = input.parse(await jsonBody(request, 4096));
    const limit = await s.db.rpc("consume_mfa_attempt", {
      p_action: body.action === "send" ? "recovery_send" : "recovery_verify",
    });
    if (limit.error)
      return NextResponse.json(
        { error: "操作回数の上限です。時間をおいて再度お試しください。" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    const verify = authClient();
    const { data: credentials, error: wrong } =
      await verify.auth.signInWithPassword({
        email: s.user.email,
        password: body.password,
      });
    if (wrong || credentials.user?.id !== s.user.id)
      return NextResponse.json(
        { error: "現在のパスワードを確認してください。" },
        { status: 403, headers },
      );
    await verify.auth.signOut({ scope: "local" });
    const admin = recoveryAdmin();
    if (body.action === "send") {
      const { requestId, code } = newRecoveryCode();
      const c = config()!;
      const { error } = await admin.rpc("begin_mfa_email_recovery", {
        p_user: s.user.id,
        p_request: requestId,
        p_hash: recoveryCodeHash(s.user.id, requestId, code, c.secret),
      });
      if (error) throw error;
      await setMfaRecoveryCookie(s.user.id, requestId);
      // Destination is the verified Auth account, never a client-supplied address.
      await sendRecoveryEmail(s.user.email, code);
      return NextResponse.json(
        {
          ok: true,
          message:
            "登録メールに復旧コードを送りました。10分以内に入力してください。",
        },
        { headers },
      );
    }
    const pending = await readMfaRecoveryCookie(s.user.id);
    if (!pending)
      return NextResponse.json(
        { error: "このブラウザから復旧コードを送り直してください。" },
        { status: 403, headers },
      );
    const { data: valid, error } = await admin.rpc(
      "verify_mfa_email_recovery",
      {
        p_user: s.user.id,
        p_request: pending.requestId,
        p_hash: recoveryCodeHash(
          s.user.id,
          pending.requestId,
          body.code,
          config()!.secret,
        ),
      },
    );
    if (error || valid !== true)
      return NextResponse.json(
        {
          error: "復旧コードが正しくないか、有効期限・入力回数を超えています。",
        },
        { status: 403, headers },
      );
    // The transaction above blocks app data before external Auth mutations start.
    const { data: listed, error: listError } =
      await admin.auth.admin.mfa.listFactors({ userId: s.user.id });
    if (listError) throw listError;
    for (const factor of listed.factors) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({
        userId: s.user.id,
        id: factor.id,
      });
      if (error) throw error;
    }
    const signedOut = await admin.auth.admin.signOut(s.token, "global");
    if (
      signedOut.error &&
      ![401, 403, 404].includes(signedOut.error.status || 0)
    )
      throw signedOut.error;
    const client = authClient();
    const { data: login, error: loginError } =
      await client.auth.signInWithPassword({
        email: s.user.email,
        password: body.password,
      });
    if (loginError || !login.session || login.user?.id !== s.user.id)
      throw loginError || new Error("login_failed");
    const claims = JSON.parse(
      Buffer.from(
        login.session.access_token.split(".")[1],
        "base64url",
      ).toString("utf8"),
    );
    const sid = z.uuid().parse(claims.session_id);
    const authorized = await admin.rpc("complete_mfa_email_recovery", {
      p_user: s.user.id,
      p_request: pending.requestId,
      p_session: sid,
    });
    if (authorized.error) throw authorized.error;
    await saveSession(login.session);
    await clearMfaRecoveryCookie();
    let notificationSent = true;
    try {
      await sendRecoveryEmail(s.user.email, undefined, "disabled");
    } catch {
      notificationSent = false;
    }
    return NextResponse.json(
      {
        ok: true,
        reenroll: false,
        notificationSent,
        message:
          "復旧しました。二要素認証はオフになっています。端末を用意できたら設定から再度有効にできます。",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "復旧を完了できませんでした。時間をおいてコードを送り直してください。",
      },
      { status: 400, headers },
    );
  }
}

export async function POST(request: Request) {
  const response = await handlePOST(request);
  await recordSecurityResult("mfa_recovery", response.status);
  return response;
}
