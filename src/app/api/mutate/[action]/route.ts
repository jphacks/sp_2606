import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, validateMutation, jsonBody } from "@/lib/server";
import {
  profileSchema,
  studySchema,
  postSchema,
  targetSchema,
  deleteSchema,
} from "@/lib/validation";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    await validateMutation(request);
    const s = await currentSession();
    if (!s)
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 },
      );
    const { action } = await params,
      body = await jsonBody(request);
    let result;
    if (action === "reaction") {
      const p = z
        .object({ post: z.uuid(), enabled: z.boolean() })
        .strict()
        .parse(body);
      result = await s.db.rpc("set_post_reaction", {
        p_post: p.post,
        p_enabled: p.enabled,
      });
    } else if (action === "comment") {
      const p = z
        .object({ post: z.uuid(), body: z.string().trim().min(1).max(500) })
        .strict()
        .parse(body);
      result = await s.db.rpc("create_comment", {
        p_post: p.post,
        p_body: p.body,
      });
    } else if (action === "comment-delete") {
      const p = deleteSchema.parse(body);
      result = await s.db.rpc("remove_comment", { p_id: p.id });
    } else if (action === "dm-send") {
      const p = z
        .object({
          target: z.uuid(),
          body: z.string().trim().min(1).max(2000),
          request_id: z.uuid(),
        })
        .strict()
        .parse(body);
      result = await s.db.rpc("send_message", {
        p_recipient: p.target,
        p_body: p.body,
        p_request_id: p.request_id,
      });
    } else if (action === "dm-respond") {
      const p = targetSchema.parse(body);
      result = await s.db.rpc("respond_dm", {
        p_sender: p.target,
        p_accept: p.enabled,
      });
    } else if (action === "dm-delete") {
      const p = deleteSchema.parse(body);
      result = await s.db.rpc("remove_message", { p_id: p.id });
    } else if (action === "follow-respond") {
      const p = targetSchema.parse(body);
      result = await s.db.rpc("respond_follow", {
        p_sender: p.target,
        p_accept: p.enabled,
      });
    } else if (action === "profile") {
      const p = profileSchema.parse(body);
      result = await s.db.rpc("save_profile_goals", {
        p_name: p.display_name,
        p_fields: p.learning_fields,
        p_goals: p.goals,
        p_bio: p.bio,
        p_recommend: p.recommend,
        p_visibility: p.visibility,
        p_dm_policy: p.dm_policy,
      });
    } else if (action === "study") {
      const p = studySchema.parse(body);
      result = await s.db.rpc("record_study_with_visibility", {
        p_field: p.field,
        p_date: p.date,
        p_minutes: p.minutes,
        p_request_id: p.request_id,
        p_memo: p.memo,
      });
    } else if (action === "post") {
      const p = postSchema.parse(body);
      result = await s.db.rpc("create_post", { p_body: p.body });
    } else if (action === "follow" || action === "block") {
      const p = targetSchema.parse(body);
      result = await s.db.rpc(
        action === "follow" ? "set_follow" : "set_block",
        {
          p_target: p.target,
          [action === "follow" ? "p_follow" : "p_block"]: p.enabled,
        },
      );
    } else if (action === "delete-study" || action === "delete-post") {
      const p = deleteSchema.parse(body);
      result = await s.db.rpc(
        action === "delete-study" ? "remove_study" : "remove_post",
        { p_id: p.id },
      );
    } else
      return NextResponse.json(
        { error: "この機能はまだ有効ではありません。" },
        { status: 404 },
      );
    if (result.error) {
      const limited = result.error.message.includes("rate_limited");
      return NextResponse.json(
        {
          error: limited
            ? "操作が多すぎます。時間をおいてください。"
            : "保存できませんでした。権限・入力・利用制限をご確認ください。",
        },
        {
          status: limited ? 429 : 400,
          headers: limited ? { "Retry-After": "60" } : {},
        },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "入力または操作を確認してください。" },
      { status: 400 },
    );
  }
}
