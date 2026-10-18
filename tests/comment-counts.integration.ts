import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("reply counts include all visible replies and deny blocked/private/anonymous access", async () => {
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
      await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;end$$; create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text);" + await readFile(new URL(f, dir), "utf8"));
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
    await db.exec("reset role");
    const post=crypto.randomUUID();
    await db.query("insert into public.posts(id,owner_id,body) values($1,$2,'test')",[post,a]);
    await db.query("insert into public.comments(post_id,owner_id,body) select $1,$2,'reply' from generate_series(1,51)",[post,b]);
    const count=async(user:string)=>Number((await as(user,"select * from public.read_comment_counts($1)",[[post]]))[0]?.total);
    assert.equal(await count(a),51);
    await as(a,"select public.set_block($1,true)",[b]);
    assert.equal(await count(a),0);
    assert.equal((await as(b,"select * from public.read_comment_counts($1)",[[post]])).length,0);
    await assert.rejects(()=>as(null,"select * from public.read_comment_counts($1)",[[post]]));
    await assert.rejects(()=>as(a,"select * from public.read_comment_counts($1)",[Array(21).fill(post)]));
    await db.exec("reset role");
    await db.query("update private.preferences set visibility='private' where id=$1",[a]);
    assert.equal((await as(c,"select * from public.read_comment_counts($1)",[[post]])).length,0);
  } finally { await db.close(); }
});
