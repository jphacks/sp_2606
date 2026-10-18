import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("study dashboard aggregates all rows and enforces memo visibility, approved followers and immediate revocation", async () => {
  const db = new PGlite();
  const a = "00000000-0000-4000-8000-000000000001",
    b = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;end$$; create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text);" + await readFile(new URL(f, dir), "utf8"));
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    async function as(user: string | null, sql: string, args: unknown[] = []) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return (await db.query<any>(sql, args)).rows;
    }
    const request = "00000000-0000-4000-8000-000000000003";
    const insert =
      "select public.record_study_with_visibility('Python',current_date,30,$1,$2) id";
    const id = (
      await as(a, insert, [request, "private <script>memo</script>"])
    )[0].id;
    assert.equal((await as(a, insert, [request, "retry"]))[0].id, id);
    const read = (user: string | null) =>
      as(
        user,
        "select public.read_study_dashboard($1,date_trunc('month',current_date)::date) data",
        [a],
      );
    const own = (await read(a))[0].data;
    assert.equal(own.records.length, 1);
    assert.equal(own.records[0].memo, "private <script>memo</script>");
    assert.equal((await read(b))[0].data.records[0].memo, null);
    await db.exec("reset role");
    await db.query(
      "update private.preferences set visibility='public' where id=$1",
      [a],
    );
    assert.equal(
      (await read(b))[0].data.records[0].memo,
      "private <script>memo</script>",
    );
    const legacy = (
      await as(
        a,
        "select public.record_study_with_memo('Python',current_date,1,$1,'legacy private') id",
        [crypto.randomUUID()],
      )
    )[0].id;
    const legacyView = (await read(b))[0].data.records.find(
      (r: any) => r.id === legacy,
    );
    assert.equal(legacyView.memo, null);
    await as(a, "select public.remove_study($1)", [legacy]);
    await db.exec("reset role");
    await db.query(
      "update private.preferences set visibility='mutual' where id=$1",
      [a],
    );
    await db.query(
      "insert into public.posts(owner_id,body) values($1,'followers-only post')",
      [a],
    );
    await as(b, "select public.set_follow($1,true)", [a]);
    assert.equal((await read(b))[0].data.records[0].memo, null); // pending followers cannot read
    assert.equal(
      (await as(b, "select * from public.read_posts('recommended')")).length,
      0,
    );
    await as(a, "select public.respond_follow($1,true)", [b]);
    assert.equal(
      (await as(b, "select * from public.read_posts('recommended')")).length,
      1,
    );
    assert.equal(
      (await as(b, "select * from public.search_field_posts('Python')")).length,
      1,
    );
    assert.equal(
      (await as(b, "select public.dm_status($1) status", [a]))[0].status
        .can_contact,
      false,
    ); // DM still requires mutual follows

    assert.equal(
      (await read(b))[0].data.records[0].memo,
      "private <script>memo</script>",
    );
    await as(b, "select public.set_follow($1,false)", [a]);
    assert.equal((await read(b))[0].data.records[0].memo, null);
    assert.equal(
      (await as(b, "select * from public.read_posts('recommended')")).length,
      0,
    );
    assert.equal(
      (await as(b, "select * from public.search_field_posts('Python')")).length,
      0,
    );
    await db.exec("reset role");
    await db.query(
      "update private.preferences set visibility='private' where id=$1",
      [a],
    );
    assert.equal((await read(b))[0].data.records[0].memo, null);
    await assert.rejects(
      as(b, "select * from private.study_memos"),
      /permission denied/,
    );
    await assert.rejects(read(null), /permission denied/);
    await assert.rejects(
      as(a, insert, [crypto.randomUUID(), "x".repeat(501)]),
      /invalid_memo/,
    );
    await assert.rejects(
      as(a, "select public.read_study_dashboard($1,'2026-10-02')", [a]),
      /invalid_month/,
    );
    await db.exec("reset role");
    await db.query(
      "update private.preferences set visibility='public' where id=$1",
      [a],
    );
    await as(b, "select public.set_block($1,true)", [a]);
    assert.equal((await read(b))[0].data, null);
    await as(b, "select public.set_block($1,false)", [a]);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      a,
    ]);
    assert.equal((await read(b))[0].data, null);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=false where id=$1", [
      a,
    ]);
    // More than 1,000 rows: chart totals must still include every record.
    await db.query(
      "insert into public.study_records(owner_id,field,study_date,minutes,request_id) select $1,'AWS',current_date,1,gen_random_uuid() from generate_series(1,1001)",
      [a],
    );
    const full = (await read(a))[0].data;
    assert.equal(full.records.length, 1000);
    assert.equal(full.records_truncated, true);
    assert.equal(
      full.daily.reduce((sum: number, r: any) => sum + r.minutes, 0),
      1031,
    );
    await as(a, "select public.remove_study($1)", [id]);
    await db.exec("reset role");
    assert.equal(
      (await db.query<any>("select count(*) n from private.study_memos"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
