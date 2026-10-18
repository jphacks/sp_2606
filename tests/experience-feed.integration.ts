import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("experience modes, goal-prioritized feed and visible comment author fields", async () => {
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
    const fields = [
      { field: "Python", mode: "level", level: 0, total_minutes: null },
    ];
    const goal = [
      {
        catalog_id: "tech-python",
        start_month: "2026-10",
        target_month: "2027-01",
        target_level: 2,
      },
    ];
    await as(
      a,
      "select public.save_profile_goals('A',$1,$2,'',true,'public','mutual')",
      [JSON.stringify(fields), JSON.stringify(goal)],
    );
    await as(
      b,
      "select public.save_profile_goals('B',$1,$2,'',true,'public','mutual')",
      [JSON.stringify(fields), JSON.stringify(goal)],
    );
    await as(
      c,
      "select public.save_profile_goals('C',$1,'[]','',true,'public','mutual')",
      [JSON.stringify(fields)],
    );
    await assert.rejects(() =>
      as(
        a,
        "select public.save_profile_fields('A',$1,'','',true,'public','mutual')",
        [
          JSON.stringify([
            { field: "Python", mode: "time", level: null, total_minutes: 100 },
          ]),
        ],
      ),
    );
    await assert.rejects(() =>
      as(
        a,
        "select public.save_profile_fields('A',$1,'','',true,'public','mutual')",
        [
          JSON.stringify([
            { field: "基本情報", mode: "level", level: 0, total_minutes: null },
          ]),
        ],
      ),
    );
    await db.exec("reset role");
    const [old, recent] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.query(
      "insert into public.posts(id,owner_id,body,created_at) values($1,$2,'goal match',now()-interval '2 days'),($3,$4,'new unrelated goal',now())",
      [old, b, recent, c],
    );
    const feed = await as(
      a,
      "select * from public.read_activity_feed('similar')",
    );
    assert(
      feed.findIndex((p) => p.id === old) <
        feed.findIndex((p) => p.id === recent),
    );
    await db.exec("reset role");
    await db.query(
      "insert into public.comments(post_id,owner_id,body) values($1,$2,'reply')",
      [old, c],
    );
    const comments = (
      await as(a, "select public.read_comments_with_authors($1) result", [old])
    )[0].result;
    assert.equal(comments[0].author.display_name, "C");
    assert.equal(comments[0].author.learning_fields[0].field, "Python");
    await as(a, "select public.set_block($1,true)", [c]);
    assert.equal(
      (
        await as(a, "select public.read_comments_with_authors($1) result", [
          old,
        ])
      )[0].result.length,
      0,
    );
    await assert.rejects(() =>
      as(null, "select public.read_comments_with_authors($1)", [old]),
    );
    const attrs = {
      background: "humanities",
      university: "デモ大学",
      faculty: "デモ学部",
      work: "テスト業務",
      prefecture: "北海道",
    };
    await as(
      a,
      "select public.save_profile_complete('A',$1,$2,'',true,'public','mutual',$3)",
      [JSON.stringify(fields), JSON.stringify(goal), JSON.stringify(attrs)],
    );
    assert.deepEqual(
      (await as(b, "select attributes from public.read_profile($1)", [a]))[0]
        .attributes,
      attrs,
    );
    await assert.rejects(() =>
      as(
        a,
        "select public.save_profile_complete('A',$1,$2,'',true,'public','mutual',$3)",
        [
          JSON.stringify(fields),
          JSON.stringify(goal),
          JSON.stringify({ ...attrs, background: "" }),
        ],
      ),
    );
    await assert.rejects(() =>
      as(
        a,
        "select public.save_profile_complete('A',$1,$2,'',true,'public','mutual',$3)",
        [
          JSON.stringify(fields),
          JSON.stringify(goal),
          JSON.stringify({ ...attrs, prefecture: "架空県" }),
        ],
      ),
    );
    await assert.rejects(() =>
      as(null, "select * from public.read_profile($1)", [a]),
    );
  } finally {
    await db.close();
  }
});
