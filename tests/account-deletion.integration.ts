import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
test("hard Auth deletion cascades personal data and both directions of DM, preserves unrelated users", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,status text,factor_type text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    const a = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.query(
      "insert into public.posts(owner_id,body) values($1,'A post'),($2,'B post')",
      [a, b],
    );
    await db.query(
      "insert into public.comments(post_id,owner_id,body) select id,$1,'A reply' from public.posts where owner_id=$2",
      [a, b],
    );
    await db.query(
      "insert into public.messages(sender,recipient,body,request_id) values($1,$2,'outgoing',gen_random_uuid()),($2,$1,'incoming',gen_random_uuid())",
      [a, b],
    );
    await db.query(
      "insert into private.follows(follower,following) values($1,$2)",
      [a, b],
    );
    await db.query(
      "insert into public.study_records(owner_id,field,study_date,minutes,request_id) values($1,'Python',current_date,30,gen_random_uuid())",
      [a],
    );
    await db.query(
      "insert into private.profile_avatars(owner_id,image) values($1,'test')",
      [a],
    );
    await db.query("delete from auth.users where id=$1", [a]);
    for (const table of [
      "public.messages",
      "public.comments",
      "private.follows",
      "public.study_records",
      "private.profile_avatars",
    ])
      assert.equal(
        (await db.query<{ n: number }>(`select count(*)::int n from ${table}`))
          .rows[0].n,
        0,
        table,
      );
    assert.equal(
      (await db.query("select * from public.profiles where id=$1", [a])).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.posts where owner_id=$1", [b])).rows
        .length,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await assert.rejects(db.query("select public.get_settings()"));
  } finally {
    await db.close();
  }
});
