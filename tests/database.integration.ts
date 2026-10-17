import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
test("real SQL: direct API privileges, RLS helpers, mutual revocation, blocks, suspension and rate enforcement", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610170001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const id of [A, B, C])
    await db.query(`insert into auth.users(id) values($1)`, [id]);
  async function as<T>(id: string | null, sql: string, params: unknown[] = []) {
    await db.exec(`reset role;set role ${id ? "authenticated" : "anon"};`);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      id || "",
    ]);
    return db.query<T>(sql, params);
  }
  async function owner(sql: string, params: unknown[] = []) {
    await db.exec("reset role");
    return db.query(sql, params);
  }
  // RPC functions must reject anonymous and raw table operations must not bypass RPC budgets.
  await assert.rejects(as(null, "select * from public.read_profiles()"));
  await assert.rejects(as(A, "select * from public.profiles"));
  await assert.rejects(
    as(A, "insert into public.posts(owner_id,body) values($1,'fake')", [B]),
  );
  await assert.rejects(as(A, "select * from private.follows"));
  const post = await as<{ create_post: string }>(
    A,
    "select public.create_post('SECRET_MUTUAL')",
  );
  const postId = post.rows[0].create_post;
  assert.equal(
    (await as(B, "select * from public.read_posts()")).rows.length,
    0,
  );
  await as(A, "select public.set_follow($1,true)", [B]);
  assert.equal(
    (await as(B, "select * from public.read_posts()")).rows.length,
    0,
    "one-way follow insufficient",
  );
  await as(B, "select public.set_follow($1,true)", [A]);
  assert.equal(
    (await as(B, "select * from public.read_posts()")).rows.length,
    1,
  );
  assert.equal(
    (await as(C, "select * from public.read_posts()")).rows.length,
    0,
  );
  await as(B, "select public.remove_post($1)", [postId]);
  assert.equal(
    (await as(A, "select * from public.read_posts()")).rows.length,
    1,
    "other user cannot delete",
  );
  await as(B, "select public.set_follow($1,false)", [A]);
  assert.equal(
    (await as(B, "select * from public.read_posts()")).rows.length,
    0,
    "old posts hidden immediately on unfollow",
  );
  await as(
    A,
    "select public.save_profile('A','Python',0,'','','true','public','mutual')",
  );
  assert.equal(
    (await as(C, "select * from public.read_posts()")).rows.length,
    1,
  );
  const key = "10000000-0000-4000-8000-000000000001";
  await as(A, "select public.record_study('Python',current_date,30,$1)", [key]);
  await as(A, "select public.record_study('Python',current_date,30,$1)", [key]);
  let studies = await as<Record<string, unknown>>(
    C,
    "select * from public.read_study($1,current_date-6,current_date)",
    [A],
  );
  assert.equal(
    studies.rows.length,
    1,
    "same request key creates exactly one record",
  );
  assert(!("body" in studies.rows[0]));
  await as(A, "select public.set_block($1,true)", [C]);
  assert.equal(
    (await as(C, "select * from public.read_posts()")).rows.length,
    0,
  );
  assert.equal(
    (
      await as(
        C,
        "select * from public.read_study($1,current_date-6,current_date)",
        [A],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(as(C, "select public.set_follow($1,true)", [A]));
  const connections = await as<{ get_connections: { following: string[] } }>(
    A,
    "select public.get_connections()",
  );
  assert.deepEqual(connections.rows[0].get_connections.following, [B]);
  for (let i = 0; i < 4; i++) await as(A, `select public.create_post('post')`);
  await assert.rejects(
    as(A, `select public.create_post('over budget')`),
    /rate_limited/,
  );
  await owner("update private.accounts set suspended=true where id=$1", [A]);
  await assert.rejects(
    as(A, `select public.create_post('suspended')`),
    /not_allowed/,
  );
  await assert.rejects(as(A, "select public.get_settings()"), /not_allowed/);
  // Verify all exposed tables are RLS-protected and anon has no execute on app RPCs.
  const rls = await owner(
    "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
  );
  assert(rls.rows.every((r: any) => r.relrowsecurity));
  const anon = await owner(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')",
  );
  assert.equal(anon.rows.length, 0);
  await db.close();
});
