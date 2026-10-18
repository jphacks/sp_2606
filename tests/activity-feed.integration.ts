import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("activity feed merges study and posts, preserves memo audiences and applies filters before limits", async () => {
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
    await as(
      b,
      "select public.record_study_with_visibility('Python',current_date,45,$1,'shared memo')",
      [crypto.randomUUID()],
    );
    await as(
      c,
      "select public.record_study_with_visibility('Rust',current_date,30,$1,'Rust memo')",
      [crypto.randomUUID()],
    );
    const feed = (
      mode = "recommended",
      owner: string | null = null,
      field: string | null = null,
    ) =>
      as(a, "select * from public.read_activity_feed($1,$2,$3)", [
        mode,
        owner,
        field,
      ]);
    const initial = await feed();
    assert.equal(initial.length, 3);
    assert.equal(initial.filter((r) => r.kind === "study").length, 2);
    assert.equal(initial.find((r) => r.owner_id === b).memo, null);
    assert.ok(
      initial.every(
        (r) => r.author.id === r.owner_id && r.author.learning_fields,
      ),
    );
    assert.equal((await feed("similar")).length, 1); // only matching Python study, not hidden prose
    assert.equal((await feed("following")).length, 0);
    assert.equal((await feed("recommended", null, "Rust")).length, 2);
    await as(a, "select public.set_follow($1,true)", [b]);
    assert.equal((await feed("following")).length, 0);
    await as(b, "select public.respond_follow($1,true)", [a]);
    const following = await feed("following");
    assert.equal(following.length, 2);
    assert.equal(following.find((r) => r.kind === "study").memo, "shared memo");
    assert.equal((await feed("similar")).length, 2);
    const profile = await feed("similar", c);
    assert.equal(profile.length, 2); // profile view is not filtered by viewer's experience
    await as(a, "select public.set_follow($1,false)", [b]);
    const revoked = await feed();
    assert.equal(revoked.find((r) => r.owner_id === b).memo, null);
    assert.ok(!revoked.some((r) => r.owner_id === b && r.kind === "post"));
    await as(a, "select public.set_block($1,true)", [b]);
    assert.ok((await feed()).every((r) => r.owner_id !== b));
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      c,
    ]);
    assert.equal((await feed()).length, 0);
    await assert.rejects(
      as(null, "select * from public.read_activity_feed()"),
      /permission denied/,
    );
    await assert.rejects(
      as(a, "select * from public.study_records"),
      /permission denied/,
    );
    await assert.rejects(feed("bad"), /invalid_mode/);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=false where id=$1", [
      c,
    ]);
    await db.query(
      "insert into public.posts(owner_id,body) select $1,'bulk' from generate_series(1,25)",
      [c],
    );
    assert.equal((await feed()).length, 20);
    assert.equal((await feed("similar")).length, 0); // Rust volume never pushes nonmatching users into similar
  } finally {
    await db.close();
  }
});
