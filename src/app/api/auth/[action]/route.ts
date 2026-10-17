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
} from "@/lib/server";
import { loginSchema, signupSchema } from "@/lib/validation";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(
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
      const s = await currentSession();
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
      const parsed = z.object({ email: z.string().email().max(254) }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "メールアドレスを確認してください。" }, { status: 400 });
      const { client, persist } = await pkceClient();
      const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: c.origin + "/auth/callback",
      });
      persist();
      if (error) return NextResponse.json({ error: "再設定メールを送信できませんでした。メール送信上限の可能性があります。時間をおいてお試しください。" }, { status: 429 });
      return NextResponse.json({ ok: true, message: "登録済みのアドレスには再設定メールが届きます。このブラウザでリンクを開いた後、パスワード設定画面へ進んでください。" });
    }
    if (action === "password") {
      const parsed = z.object({ password: z.string().min(12).max(128) }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "新しいパスワードは12〜128文字にしてください。" }, { status: 400 });
      const s = await currentSession();
      if (!s) return NextResponse.json({ error: "再設定メールのリンクを同じブラウザで開いてください。" }, { status: 401 });
      const response = await fetch(c.url + "/auth/v1/user", {
        method: "PUT", headers: { apikey: c.key, Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data), cache: "no-store",
      });
      if (!response.ok) return NextResponse.json({ error: "パスワードを変更できませんでした。再設定メールからやり直してください。" }, { status: 400 });
      await clearSession();
      return NextResponse.json({ ok: true, message: "パスワードを変更しました。新しいパスワードでログインしてください。" });
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
      const s = await currentSession();
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
