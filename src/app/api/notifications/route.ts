import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, validateMutation, jsonBody } from "@/lib/server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const post = new URL(request.url).searchParams.get("post");
    if (post && !z.uuid().safeParse(post).success)
      return NextResponse.json(
        { error: "対象が不正です。" },
        { status: 400, headers },
      );
    const result = post
      ? await s.db.rpc("notification_post", { p_post: post })
      : await s.db.rpc("read_notifications");
    if (result.error)
      return NextResponse.json(
        { error: "通知を取得できませんでした。" },
        { status: 503, headers },
      );
    return NextResponse.json(result.data, { headers });
  } catch {
    return NextResponse.json(
      { error: "通知を取得できませんでした。" },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    await validateMutation(request, 1024);
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const body = z
      .object({ until: z.iso.datetime({ offset: true }) })
      .strict()
      .parse(await jsonBody(request, 1024));
    const result = await s.db.rpc("mark_notifications_read", {
      p_until: body.until,
    });
    if (result.error) throw new Error("failed");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "既読にできませんでした。" },
      { status: 400, headers },
    );
  }
}
