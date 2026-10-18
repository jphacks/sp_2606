import {
  recordSecurityResult,
  type MonitorScope,
} from "@/lib/security-monitor";
import { NextResponse } from "next/server";
import {
  config,
  currentSession,
  clearSession,
  saveSession,
  authClient,
  pkceClient,
  validateMutation,
  jsonBody,
  canRecover,
  clearRecoveryProof,
} from "@/lib/server";
import { loginSchema, signupSchema } from "@/lib/validation";
import { z } from "zod";
export const dynamic = "force-dynamic";
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    await validateMutation(request);
    const c = config();
    if (!c)
      return NextResponse.json(
        { error: "Supabaseの接続設定がまだありません。" },
        { status: 503 },
      );
    const { action } = await params;
    if (action === "logout") {
      const s = await currentSession(true);
      if (s) {
        const r = await fetch(c.url + "/auth/v1/logout?scope=global", {
          method: "POST",
          headers: { apikey: c.key, Authorization: "Bearer " + s.token },
          cache: "no-store",
        });
        if (!r.ok)
          return NextResponse.json(
            { error: "セッションを失効できませんでした。再度お試しください。" },
            { status: 503 },
          );
      }
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    const body = await jsonBody(request);
    if (action === "recover") {
      const parsed = z
        .object({ email: z.string().email().max(254) })
        .strict()
        .safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "メールアドレスを確認してください。" },
          { status: 400 },
        );
      const { client, persist } = await pkceClient();
      const { error } = await client.auth.resetPasswordForEmail(
        parsed.data.email,
        {
          redirectTo: c.origin + "/auth/callback",
        },
      );
      persist("recovery");
      if (error)
        return NextResponse.json(
          {
            error:
              "再設定メールを送信できませんでした。メール送信上限の可能性があります。時間をおいてお試しください。",
          },
          { status: 429 },
        );
      return NextResponse.json({
        ok: true,
        message:
          "登録済みのアドレスには再設定メールが届きます。このブラウザでリンクを開いた後、パスワード設定画面へ進んでください。",
      });
    }
    if (action === "password") {
      const parsed = z
        .object({
          password: z.string().min(12).max(128),
          currentPassword: z.string().min(1).max(128).optional(),
        })
        .strict()
        .safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "新しいパスワードは12〜128文字にしてください。" },
          { status: 400 },
        );
      const s = await currentSession(true);
      if (!s)
        return NextResponse.json(
          { error: "再設定メールのリンクを同じブラウザで開いてください。" },
          { status: 401 },
        );
      const recovered = await canRecover(s.user.id, s.token);
      if (s.mfaRequired && !recovered)
        return NextResponse.json(
          {
            error:
              "先に二要素認証を完了するか、再設定メールのリンクを開いてください。",
          },
          { status: 403 },
        );
      if (!recovered) {
        if (!parsed.data.currentPassword || !s.user.email)
          return NextResponse.json(
            {
              error:
                "現在のパスワードを入力するか、再設定メールからやり直してください。",
            },
            { status: 403 },
          );
        const verifier = authClient();
        const { data, error } = await verifier.auth.signInWithPassword({
          email: s.user.email,
          password: parsed.data.currentPassword,
        });
        if (error || !data.session || data.user?.id !== s.user.id)
          return NextResponse.json(
            { error: "現在のパスワードを確認してください。" },
            { status: 403 },
          );
        await verifier.auth.signOut({ scope: "local" });
      }
      await clearRecoveryProof();
      const response = await fetch(c.url + "/auth/v1/user", {
        method: "PUT",
        headers: {
          apikey: c.key,
          Authorization: "Bearer " + s.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: parsed.data.password }),
        cache: "no-store",
      });
      if (!response.ok)
        return NextResponse.json(
          {
            error:
              "パスワードを変更できませんでした。再設定メールからやり直してください。",
          },
          { status: 400 },
        );
      await clearSession();
      return NextResponse.json({
        ok: true,
        message:
          "パスワードを変更しました。新しいパスワードでログインしてください。",
      });
    }
    if (action === "signup") {
      if (process.env.ALLOW_SIGNUP !== "true")
        return NextResponse.json(
          { error: "登録受付の設定がまだ完了していません。" },
          { status: 503 },
        );
      const parsed = signupSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "入力を確認してください。パスワードは12文字以上です。" },
          { status: 400 },
        );
      const { client, persist } = await pkceClient();
      const { data, error } = await client.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: c.origin + "/auth/callback",
          data: { visibility: "mutual" },
        },
      });
      persist();
      if (error)
        return NextResponse.json(
          {
            error:
              "登録を完了できませんでした。入力・時間をおいて再確認してください。",
          },
          { status: 400 },
        );
      if (data.session) {
        await client.auth.signOut();
        return NextResponse.json(
          {
            error:
              "メール確認設定が必要です。管理画面でメール確認を有効にしてください。",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({
        ok: true,
        message:
          "登録可能なメールアドレスには確認メールが届きます。このブラウザでリンクを開いてください。",
      });
    }
    if (action === "login") {
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "メールアドレスとパスワードを確認してください。" },
          { status: 400 },
        );
      const { data, error } = await authClient().auth.signInWithPassword(
        parsed.data,
      );
      if (error || !data.session)
        return NextResponse.json(
          {
            error:
              "ログインできませんでした。入力内容とメール確認をご確認ください。",
          },
          { status: 401 },
        );
      await saveSession(data.session);
      const s = await currentSession(true);
      if (!s)
        return NextResponse.json(
          { error: "このアカウントでは利用できません。" },
          { status: 403 },
        );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "未対応の操作です。" }, { status: 404 });
  } catch {
    return NextResponse.json(
      {
        error:
          "操作を受け付けられませんでした。画面を更新して再度お試しください。",
      },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  const scope: MonitorScope | undefined =
    action === "login"
      ? "login"
      : action === "recover"
        ? "password_email"
        : undefined;
  const response = await handlePOST(request, context);
  if (scope) await recordSecurityResult(scope, response.status);
  return response;
}
