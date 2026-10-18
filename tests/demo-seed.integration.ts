import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("opt-in demo seed: repeatable, no login credentials, real-data isolation, feed visibility and scoped cleanup", async () => {
  const db = new PGlite();
  const viewer = "00000000-0000-4000-8000-000000000099";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;end$$; create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text);" + await readFile(new URL(f, directory), "utf8"));
    await db.query(
      "insert into auth.users(id,email) values($1,'real-test@example.invalid')",
      [viewer],
    );
    await db.query(
      `update public.profiles set display_name='Real viewer',learning_fields='[{"field":"Python","mode":"level","level":0,"total_minutes":null},{"field":"Microsoft Azure","mode":"level","level":0,"total_minutes":null}]' where id=$1`,
      [viewer],
    );
    const before = (
      await db.query("select * from public.profiles where id=$1", [viewer])
    ).rows;
    const seed = await readFile(
      new URL("../supabase/demo/timeline-seed.sql", import.meta.url),
      "utf8",
    );
    await db.exec(seed);
    const expansion = await readFile(
      new URL("../supabase/demo/timeline-expand-50.sql", import.meta.url),
      "utf8",
    );
    await db.exec(expansion);
    const expansion100 = await readFile(
      new URL("../supabase/demo/timeline-expand-100.sql", import.meta.url),
      "utf8",
    );
    const priorDemos = (
      await db.query("select * from public.profiles order by id")
    ).rows;
    await db.exec(expansion100);
    await db.exec(expansion100);
    const priorIds = priorDemos.map((p: any) => p.id);
    assert.deepEqual(
      (
        await db.query(
          "select * from public.profiles where id=any($1::uuid[]) order by id",
          [priorIds],
        )
      ).rows,
      priorDemos,
    );
    await db.exec(seed);
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from private.demo_seed_users"))
          .rows[0].n,
      ),
      100,
    );
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from public.posts")).rows[0].n,
      ),
      200,
    );
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from public.study_records"))
          .rows[0].n,
      ),
      200,
    );
    assert.deepEqual(
      (await db.query("select * from public.profiles where id=$1", [viewer]))
        .rows,
      before,
    );
    assert.equal(
      Number(
        (
          await db.query<any>(
            "select count(*) n from auth.users where raw_user_meta_data->>'costep_demo_batch'='timeline-demo-20261017-v1' and banned_until>'9999-01-01'::timestamptz and email like '%@example.invalid'",
          )
        ).rows[0].n,
      ),
      100,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      viewer,
    ]);
    const recommended = (
      await db.query<any>("select * from public.read_posts('recommended')")
    ).rows;
    assert.equal(recommended.length, 20);
    assert.ok(
      recommended.every(
        (p) =>
          p.body.startsWith("【デモ・架空 ") && !p.body.includes("HIDDEN-"),
      ),
    );
    const similar = (
      await db.query<any>("select * from public.read_posts('similar')")
    ).rows;
    assert.equal(similar.length, 16);
    for (const post of similar) {
      const author = (
        await db.query<any>("select * from public.read_profile($1)", [
          post.owner_id,
        ])
      ).rows[0];
      assert(
        author.learning_fields.some(
          (f: any) =>
            ["Python", "Microsoft Azure"].includes(f.field) &&
            f.mode === "level" &&
            f.level <= 1,
        ),
      );
    }
    assert.equal(
      (await db.query<any>("select * from public.read_posts('following')")).rows
        .length,
      0,
    );
    const users = (
      await db.query<any>("select * from public.read_recommendations()")
    ).rows;
    assert.equal(users.length, 12);
    assert.ok(users.every((p) => p.recommend));
    await assert.rejects(db.query("select * from private.demo_seed_users"));
    await db.exec("reset role");
    await db.exec(
      await readFile(
        new URL("../supabase/demo/timeline-cleanup.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from auth.users")).rows[0].n,
      ),
      1,
    );
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from public.posts")).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from public.study_records"))
          .rows[0].n,
      ),
      0,
    );
    assert.deepEqual(
      (await db.query("select * from public.profiles where id=$1", [viewer]))
        .rows,
      before,
    );
  } finally {
    await db.close();
  }
});
