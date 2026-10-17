import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
test("SQL comments and DM: nonparticipant, receiver settings, one pending message/two attempts, deletion, blocks, suspension", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of [
    "202610170001_foundation.sql",
    "202610170002_conversations.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [A, B, C])
    await db.query("insert into auth.users(id) values($1)", [id]);
  async function as<T = Record<string, unknown>>(
    id: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    return db.query<T>(sql, params);
  }
  let requestIndex = 0;
  const send = (who: string, to: string, text = "hello") =>
    as<{ send_message: string }>(who, "select public.send_message($1,$2,$3)", [
      to,
      text,
      `10000000-0000-4000-8000-${String(++requestIndex).padStart(12, "0")}`,
    ]);
  const setPolicy = (who: string, visibility: string, policy: string) =>
    as(who, "select public.save_profile('name','Python',0,'','',true,$1,$2)", [
      visibility,
      policy,
    ]);
  const post = (
    await as<{ create_post: string }>(A, "select public.create_post('private')")
  ).rows[0].create_post;
  await assert.rejects(
    as(C, "select public.create_comment($1,'not allowed')", [post]),
  );
  await setPolicy(A, "public", "mutual");
  const comment = (
    await as<{ create_comment: string }>(
      C,
      "select public.create_comment($1,'visible reply')",
      [post],
    )
  ).rows[0].create_comment;
  assert.equal(
    (await as(B, "select * from public.read_comments($1)", [post])).rows.length,
    1,
  );
  await setPolicy(A, "private", "mutual");
  assert.equal(
    (await as(B, "select * from public.read_comments($1)", [post])).rows.length,
    0,
  );
  await as(B, "select public.remove_comment($1)", [comment]);
  assert.equal(
    (await as(A, "select * from public.read_comments($1)", [post])).rows.length,
    1,
  );
  await assert.rejects(send(A, B), /dm_not_allowed/);
  await setPolicy(B, "mutual", "anyone");
  const first = (await send(A, B, "first request")).rows[0].send_message;
  await assert.rejects(send(A, B), /request_pending/);
  assert.equal(
    (await as(C, "select * from public.read_messages($1)", [A])).rows.length,
    0,
  );
  await as(C, "select public.remove_message($1)", [first]);
  assert.equal(
    (await as(B, "select * from public.read_messages($1)", [A])).rows[0].body,
    "first request",
  );
  await as(B, "select public.respond_dm($1,false)", [A]);
  await send(A, B, "second request");
  await as(B, "select public.respond_dm($1,false)", [A]);
  await assert.rejects(send(A, B), /request_limit/);
  await as(A, "select public.remove_message($1)", [first]);
  const removed = (
    await as(B, "select * from public.read_messages($1)", [A])
  ).rows.find((r) => r.id === first);
  assert.equal(removed?.body, null);
  assert.equal(removed?.deleted, true);
  await as(A, "select public.set_follow($1,true)", [B]);
  await as(B, "select public.set_follow($1,true)", [A]);
  await send(A, B, "mutual message");
  await as(B, "select public.set_follow($1,false)", [A]);
  await setPolicy(B, "mutual", "mutual");
  await assert.rejects(send(A, B), /dm_not_allowed/);
  await as(B, "select public.set_block($1,true)", [A]);
  assert(
    (await as(A, "select * from public.read_messages($1)", [B])).rows.length >
      0,
  );
  await assert.rejects(send(A, B), /not_allowed/);
  await db.exec("reset role");
  await db.query("update private.accounts set suspended=true where id=$1", [A]);
  await assert.rejects(send(A, B), /not_allowed/);
  await assert.rejects(as(C, "select * from public.messages"));
  await db.close();
});
