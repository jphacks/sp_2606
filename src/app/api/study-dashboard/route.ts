import { NextResponse } from "next/server";
import { currentSession } from "@/lib/server";
export const dynamic = "force-dynamic";
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
    const owner = params.get("owner") || s.user.id;
    const month = params.get("month") || "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        owner,
      ) ||
      !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)
    )
      return NextResponse.json(
        { error: "表示する年月が不正です。" },
        { status: 400, headers },
      );
    const { data, error } = await s.db.rpc("read_study_dashboard", {
      p_owner: owner,
      p_month: month + "-01",
    });
    if (error)
      return NextResponse.json(
        {
          error:
            "学習記録を取得できませんでした。少し待って再度お試しください。",
        },
        { status: 400, headers },
      );
    if (!data)
      return NextResponse.json(
        { error: "このユーザーの学習記録は表示できません。" },
        { status: 404, headers },
      );
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json(
      { error: "学習記録を取得できませんでした。" },
      { status: 503, headers },
    );
  }
}
