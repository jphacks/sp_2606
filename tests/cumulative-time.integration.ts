import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("cumulative study time follows matching records, retries, deletion, edits and field removal", async () => {
  const db = new PGlite();
  const [a, b, c] = [1, 2, 3].map(
    (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  );
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    await db.query("insert into auth.users(id) values($1),($2),($3)", [
      a,
      b,
      c,
    ]);
    await db.exec(
      "update private.preferences set profile_completed=true,visibility='public'",
    );
    await db.query(
      "update private.preferences set visibility='mutual' where id=$1",
      [b],
    );
    await db.query(
      `update public.profiles set learning_fields='[{"field":"Rust","mode":"level","level":0,"total_minutes":null}]' where id=$1`,
      [c],
    );
    await db.query(
      "insert into public.posts(owner_id,body,created_at) values($1,'followers prose',now()-interval '1 hour'),($2,'public prose',now()-interval '2 hours')",
      [b, c],
    );
    async function as(user: string | null, sql: string, args: unknown[] = []) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return (await db.query<any>(sql, args)).rows;
    }
    const fields=[{field:'基本情報',mode:'time',level:null,total_minutes:600}];
    await as(a,"select public.save_profile_goals('A',$1,'[]','',true,'public','mutual')",[JSON.stringify(fields)]);
    const total=async()=>Number((await as(a,"select * from public.read_profile($1)",[a]))[0].learning_fields[0].total_minutes);
    const request=crypto.randomUUID();
    const record=(await as(a,"select public.record_study('基本情報',current_date,30,$1) id",[request]))[0].id;
    assert.equal(await total(),630);
    await as(a,"select public.record_study('基本情報',current_date,30,$1)",[request]);
    assert.equal(await total(),630);
    await as(b,"select public.remove_study($1)",[record]);assert.equal(await total(),630);
    await as(a,"select public.remove_study($1)",[record]);assert.equal(await total(),600);
    const other=(await as(a,"select public.record_study('Python',current_date,20,$1) id",[crypto.randomUUID()]))[0].id;
    assert.equal(await total(),600);
    await db.exec('reset role');
    const legacy=crypto.randomUUID();
    await db.query("insert into public.study_records(id,owner_id,field,study_date,minutes,request_id) values($1,$2,'基本情報',current_date,15,$3)",[legacy,a,crypto.randomUUID()]);
    await db.query("delete from private.study_time_contributions where record_id=$1",[legacy]);
    await db.query("update public.profiles set learning_fields=$1 where id=$2",[JSON.stringify(fields),a]);
    await as(a,"select public.remove_study($1)",[legacy]);assert.equal(await total(),600);
    const live=(await as(a,"select public.record_study('基本情報',current_date,45,$1) id",[crypto.randomUUID()]))[0].id;
    assert.equal(await total(),645);
    await db.exec('reset role');await db.query("update public.study_records set minutes=60 where id=$1",[live]);assert.equal(await total(),660);
    await as(a,"select public.save_profile_goals('A',$1,'[]','',true,'public','mutual')",[JSON.stringify([{field:'Python',mode:'level',level:0,total_minutes:null}])]);
    await as(a,"select public.save_profile_goals('A',$1,'[]','',true,'public','mutual')",[JSON.stringify(fields)]);
    await as(a,"select public.remove_study($1)",[live]);assert.equal(await total(),600);
    await assert.rejects(()=>as(a,"select * from private.study_time_contributions"));
    await assert.rejects(()=>as(null,"select public.record_study('基本情報',current_date,10,$1)",[crypto.randomUUID()]));
  } finally { await db.close(); }
});
