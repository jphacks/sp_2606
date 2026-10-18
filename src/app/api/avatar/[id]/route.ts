import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, validateMutation, jsonBody } from "@/lib/server";
import { normalizeAvatar } from "@/lib/avatar-image";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await currentSession();
    if (!s) return new NextResponse(null, { status: 401, headers });
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return new NextResponse(null, { status: 400, headers });
    const { data, error } = await s.db.rpc("read_profile_avatar", {
      p_owner: id,
    });
    if (error || !data) return new NextResponse(null, { status: 404, headers });
    // Do not serve arbitrary bytes even if a direct RPC caller bypassed the UI.
    const normalized = await normalizeAvatar(String(data).replace(/\s/g, ""));
    return new NextResponse(new Uint8Array(Buffer.from(normalized, "base64")), {
      headers: { ...headers, "Content-Type": "image/jpeg" },
    });
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await validateMutation(request, 70000);
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401, headers },
      );
    const { id } = await params;
    if (id !== s.user.id)
      return NextResponse.json(
        { error: "自分のアイコンだけ変更できます。" },
        { status: 403, headers },
      );
    const body = z
      .object({ image: z.string().max(65536).nullable() })
      .strict()
      .parse(await jsonBody(request, 70000));
    const image =
      body.image === null ? null : await normalizeAvatar(body.image);
    const { error } = await s.db.rpc("set_profile_avatar", { p_image: image });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "画像を保存できませんでした。画像の形式を確認し、少し待って再度お試しください。",
      },
      { status: 400, headers },
    );
  }
}
