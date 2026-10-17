import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 },
      );
    const peer = new URL(request.url).searchParams.get("peer");
    if (peer && !z.uuid().safeParse(peer).success)
      return NextResponse.json({ error: "対象が不正です。" }, { status: 400 });
    const [inbox, messages, status] = await Promise.all([
      s.db.rpc("read_inbox"),
      peer
        ? s.db.rpc("read_messages", { p_peer: peer })
        : Promise.resolve({ data: [], error: null }),
      peer
        ? s.db.rpc("dm_status", { p_peer: peer })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if ([inbox, messages, status].some((r) => r.error))
      return NextResponse.json(
        {
          error: "会話を取得できませんでした。時間をおいて再度お試しください。",
        },
        { status: 400 },
      );
    return NextResponse.json(
      { inbox: inbox.data, messages: messages.data, status: status.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "会話を取得できませんでした。" },
      { status: 503 },
    );
  }
}
