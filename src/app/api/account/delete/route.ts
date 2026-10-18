import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  authClient,
  currentSession,
  clearSession,
  validateMutation,
  jsonBody,
  config,
} from "@/lib/server";
import { incidentMode } from "@/lib/incident-policy";
import { authorizeDeletion, deletionInput } from "@/lib/delete-account";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  let verifier: ReturnType<typeof authClient> | undefined;
  try {
    await validateMutation(request, 4096);
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインし直してください。" },
        { status: 401, headers },
      );
    const body = deletionInput.safeParse(await jsonBody(request, 4096));
    if (!body.success)
      return NextResponse.json(
        { error: "入力と削除の確認を見直してください。" },
        { status: 400, headers },
      );
    const c = config(),
      key = process.env.SUPABASE_RECOVERY_SECRET_KEY;
    if (!c || !key || incidentMode(process.env) !== "none")
      return NextResponse.json(
        { error: "現在退会を受け付けられません。時間をおいてお試しください。" },
        { status: 503, headers },
      );
    // Reuse the persisted sensitive-operation budget before password or MFA attempts.
    const budget = await s.db.rpc("consume_mfa_attempt", {
      p_action: "unenroll",
    });
    if (budget.error)
      return NextResponse.json(
        { error: "操作回数の上限です。時間をおいてお試しください。" },
        { status: 429, headers },
      );
    verifier = authClient();
    await authorizeDeletion(
      s.user,
      body.data,
      async (email, password) => {
        const result = await verifier!.auth.signInWithPassword({
          email,
          password,
        });
        return result.error ? undefined : result.data.user?.id;
      },
      async (factorId, code) => {
        const result = await verifier!.auth.mfa.challengeAndVerify({
          factorId,
          code,
        });
        return !result.error && !!result.data;
      },
    );
    const admin = createClient(c.url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    // Auth deletion and ON DELETE CASCADE remove application data in the database.
    const result = await admin.auth.admin.deleteUser(s.user.id, false);
    if (result.error)
      return NextResponse.json(
        {
          error:
            "退会処理が完了しませんでした。再ログインして状態を確認してください。",
        },
        { status: 503, headers },
      );
    await clearSession();
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "退会できませんでした。パスワード・確認コードと通信状態をご確認ください。",
      },
      { status: 400, headers },
    );
  } finally {
    if (verifier)
      await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
