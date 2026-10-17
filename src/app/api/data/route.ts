import { NextResponse } from "next/server";
import { currentSession } from "@/lib/server";
import { recommendationScore, type Profile } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 },
      );
    const q = new URL(request.url).searchParams;
    const mode = q.get("mode") || "recommended";
    if (!["recommended", "similar", "following"].includes(mode))
      return NextResponse.json(
        { error: "表示条件が不正です。" },
        { status: 400 },
      );
    const owner = q.get("owner") || s.user.id;
    if (!/^[0-9a-f-]{36}$/.test(owner))
      return NextResponse.json({ error: "対象が不正です。" }, { status: 400 });
    const to = new Date().toISOString().slice(0, 10),
      from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const [profiles, posts, studies, connections, counts] = await Promise.all([
      s.db.rpc("read_profiles"),
      s.db.rpc("read_posts", { p_mode: mode }),
      s.db.rpc("read_study", { p_owner: owner, p_from: from, p_to: to }),
      s.db.rpc("get_connections"),
      s.db.rpc("profile_counts", { p_id: owner }),
    ]);
    if ([profiles, posts, studies, connections, counts].some((r) => r.error))
      return NextResponse.json(
        {
          error:
            "取得できませんでした。接続設定・権限・取得回数をご確認ください。",
        },
        { status: 400 },
      );
    const people = (profiles.data || []) as Profile[],
      me = people.find((p) => p.id === s.user.id);
    const recommended = me
      ? people
          .filter((p) => p.id !== me.id && p.recommend)
          .sort(
            (a, b) => recommendationScore(me, b) - recommendationScore(me, a),
          )
          .slice(0, 12)
      : [];
    return NextResponse.json(
      {
        me,
        profiles: people,
        posts: posts.data,
        studies: studies.data,
        connections: connections.data,
        counts: counts.data,
        settings: s.settings,
        recommended,
        owner,
        from,
        to,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "データを取得できませんでした。" },
      { status: 503 },
    );
  }
}
