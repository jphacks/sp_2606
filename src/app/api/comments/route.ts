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
    const post = new URL(request.url).searchParams.get("post");
    if (!z.uuid().safeParse(post).success)
      return NextResponse.json({ error: "対象が不正です。" }, { status: 400 });
    const { data, error } = await s.db.rpc("read_comments_with_authors", { p_post: post });
    const counts = await s.db.rpc("read_comment_counts", { p_posts: [post] });
    if (error || counts.error)
      return NextResponse.json(
        { error: "返信を取得できませんでした。" },
        { status: 400 },
      );
    return NextResponse.json(
      { comments: data, total: counts.data?.[0]?.total ?? 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "返信を取得できませんでした。" },
      { status: 503 },
    );
  }
}
