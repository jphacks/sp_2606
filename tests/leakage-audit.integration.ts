import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("latest complete schema: no direct grants, no anonymous RPC, DM and post ownership isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    for (const sql of [
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity`,
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m') and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))`,
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and has_function_privilege('anon',p.oid,'EXECUTE')`,
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)`,
    ])
      assert.deepEqual((await db.query(sql)).rows, []);
    const [a, b, c] = [1, 2, 3].map(
      (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    );
    for (const id of [a, b, c])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.exec(
      "update private.preferences set profile_completed=true,visibility='public',dm_policy='anyone'",
    );
    async function as(id: string | null, sql: string, args: unknown[] = []) {
      await db.exec("reset role;set role " + (id ? "authenticated" : "anon"));
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
        [
          id || "",
          JSON.stringify({
            sub: id,
            aal: "aal1",
            iat: Math.floor(Date.now() / 1000),
          }),
        ],
      );
      return (await db.query<any>(sql, args)).rows;
    }
    const post = (
      await as(a, "select public.create_post('ownership audit') id")
    )[0].id;
    await as(c, "select public.remove_post($1)", [post]);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.posts where id=$1",
          [post],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      as(c, "insert into public.posts(owner_id,body) values($1,'spoof')", [a]),
    );
    await assert.rejects(as(null, "select public.read_inbox()"));
    const message = (
      await as(a, "select public.send_message($1,$2,$3) id", [
        b,
        "private audit",
        "10000000-0000-4000-8000-000000000001",
      ])
    )[0].id;
    assert.equal(
      (await as(b, "select * from public.read_messages($1)", [a])).length,
      1,
    );
    assert.equal(
      (await as(c, "select * from public.read_messages($1)", [a])).length,
      0,
    );
    await as(c, "select public.remove_message($1)", [message]);
    assert.equal(
      (await as(b, "select * from public.read_messages($1)", [a]))[0].body,
      "private audit",
    );
    await as(a, "select public.remove_message($1)", [message]);
    assert.equal(
      (await as(b, "select * from public.read_messages($1)", [a]))[0].body,
      null,
    );
  } finally {
    await db.close();
  }
});
