import { NextResponse } from "next/server";
import { currentSession } from "@/lib/server";
import { goalCatalog } from "@/lib/goals";
import { learningFieldKey } from "@/lib/learning-catalog";

export const dynamic = "force-dynamic";
const knownFields = new Set(
  goalCatalog.filter((x) => x.active).map(learningFieldKey),
);
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const params = new URL(request.url).searchParams;
    const field = params.get("field") || "";
    const kind = params.get("kind");
    if (!knownFields.has(field) || !["posts", "studies"].includes(kind || ""))
      return NextResponse.json(
        { error: "検索する分野を候補から選んでください。" },
        { status: 400, headers },
      );
    const result = await s.db.rpc(
      kind === "posts" ? "read_activity_feed" : "search_field_studies",
      kind === "posts"
        ? { p_mode: "recommended", p_field: field }
        : { p_field: field },
    );
    if (result.error)
      return NextResponse.json(
        { error: "検索できませんでした。少し待ってから再度お試しください。" },
        { status: 400, headers },
      );
    const ids =
      kind === "posts"
        ? (result.data || [])
            .filter((p: { kind: string }) => p.kind === "post")
            .map((p: { id: string }) => p.id)
        : [];
    const [reactions, commentCounts] = await Promise.all([
      s.db.rpc("read_post_reactions", { p_posts: ids }),
      s.db.rpc("read_comment_counts", { p_posts: ids }),
    ]);
    if (reactions.error || commentCounts.error)
      throw new Error("Search metadata unavailable");
    return NextResponse.json(
      {
        reactions: reactions.data || [],
        commentCounts: commentCounts.data || [],
        results:
          kind === "posts"
            ? (result.data || []).map(
                (r: { author?: { display_name?: string } }) => ({
                  ...r,
                  display_name: r.author?.display_name || "学習者",
                }),
              )
            : result.data || [],
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "検索できませんでした。" },
      { status: 503, headers },
    );
  }
}
