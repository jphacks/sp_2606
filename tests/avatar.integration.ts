import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("profile avatars enforce ownership, blocks, anonymous denial, bounds and deletion", async () => {
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
    const image = Buffer.from([255, 216, 255, 0, 255, 217]).toString("base64");
    await as(a, "select public.set_profile_avatar($1)", [image]);
    assert.equal(
      (await as(b, "select public.read_profile_avatar($1) image", [a]))[0]
        .image,
      image,
    );
    await as(b, "select public.set_profile_avatar($1)", [image]);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from private.profile_avatars")).rows.length,
      2,
    );
    await as(a, "select public.set_block($1,true)", [b]);
    assert.equal(
      (await as(b, "select public.read_profile_avatar($1) image", [a]))[0]
        .image,
      null,
    );
    await assert.rejects(() =>
      as(a, "select public.set_profile_avatar($1)", ["A".repeat(65540)]),
    );
    await assert.rejects(() =>
      as(a, "select public.set_profile_avatar($1)", [
        Buffer.from("<svg/>").toString("base64"),
      ]),
    );
    await assert.rejects(() => as(a, "select * from private.profile_avatars"));
    await assert.rejects(() =>
      as(null, "select public.read_profile_avatar($1)", [a]),
    );
    await as(a, "select public.set_profile_avatar(null)");
    assert.equal(
      (await as(a, "select public.read_profile_avatar($1) image", [a]))[0]
        .image,
      null,
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [b]);
    assert.equal(
      (await db.query("select * from private.profile_avatars")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
