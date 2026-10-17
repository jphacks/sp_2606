import { NextResponse } from "next/server";
import { currentSession } from "@/lib/server";
import { type Profile } from "@/lib/validation";
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
    // RPC mode names are retained: similar = おすすめ, recommended = 最新投稿.
    const mode = q.get("mode") || "similar";
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
    const [
      profiles,
      posts,
      studies,
      connections,
      counts,
      selected,
      recommendations,
    ] = await Promise.all([
      s.db.rpc("read_profiles"),
      s.db.rpc("read_activity_feed", {
        p_mode: mode,
        p_owner: q.get("scope") === "profile" ? owner : null,
      }),
      s.db.rpc("read_study", { p_owner: owner, p_from: from, p_to: to }),
      s.db.rpc("get_connections"),
      s.db.rpc("profile_counts", { p_id: owner }),
      s.db.rpc("read_profile", { p_id: owner }),
      s.db.rpc("read_recommendations"),
    ]);
    if (
      [
        profiles,
        posts,
        studies,
        connections,
        counts,
        selected,
        recommendations,
      ].some((r) => r.error)
    )
      return NextResponse.json(
        {
          error:
            "取得できませんでした。接続設定・権限・取得回数をご確認ください。",
        },
        { status: 400 },
      );
    const reactions = await s.db.rpc("read_post_reactions", {
      p_posts: (posts.data || [])
        .filter((post: { kind: string }) => post.kind === "post")
        .map((post: { id: string }) => post.id),
    });
    if (reactions.error)
      return NextResponse.json(
        { error: "リアクションを取得できませんでした。" },
        { status: 400 },
      );
    const people = (profiles.data || []) as Profile[];
    const profile = selected.data?.[0] as Profile | undefined;
    if (profile && !people.some((p) => p.id === profile.id))
      people.push(profile);
    for (const activity of posts.data || []) {
      if (activity.author && !people.some((p) => p.id === activity.author.id))
        people.push(activity.author as Profile);
    }
    const me = people.find((p) => p.id === s.user.id);
    const recommended = (recommendations.data || []) as Profile[];
    for (const candidate of recommended)
      if (!people.some((p) => p.id === candidate.id)) people.push(candidate);
    return NextResponse.json(
      {
        me,
        profile,
        profiles: people,
        posts: posts.data,
        reactions: reactions.data,
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
