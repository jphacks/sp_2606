import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("reactions: idempotent toggles, visibility, blocks, suspension, private access, rate limits and cascade", async () => {
  const db = new PGlite();
  const [a, b, c] = [1, 2, 3].map(
    (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  );
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, directory), "utf8"));
    await db.query("insert into auth.users(id) values($1),($2),($3)", [
      a,
      b,
      c,
    ]);
    await db.exec(
      "update private.preferences set profile_completed=true,visibility='private'",
    );
    async function as(
      user: string | null,
      sql: string,
      params: unknown[] = [],
    ) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return db.query<any>(sql, params);
    }
    const post = (await as(a, "select public.create_post('reaction test') id"))
      .rows[0].id;
    const read = (user: string | null) =>
      as(user, "select * from public.read_post_reactions($1)", [[post]]);
    const set = (user: string | null, enabled: boolean) =>
      as(user, "select public.set_post_reaction($1,$2)", [post, enabled]);
    assert.deepEqual((await read(b)).rows, []);
    await assert.rejects(set(b, true), /not_allowed/);
    await db.exec(
      "reset role;update private.preferences set visibility='public'",
    );
    await set(b, true);
    await set(b, true);
    assert.equal(Number((await read(a)).rows[0].total), 1);
    assert.equal((await read(b)).rows[0].liked, true);
    await set(c, true);
    assert.equal(Number((await read(a)).rows[0].total), 2);
    await as(a, "select public.set_block($1,true)", [b]);
    assert.equal(Number((await read(a)).rows[0].total), 1);
    assert.deepEqual((await read(b)).rows, []);
    await assert.rejects(set(b, false), /not_allowed/);
    await as(a, "select public.set_block($1,false)", [b]);
    await db.query("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      c,
    ]);
    assert.equal(Number((await read(a)).rows[0].total), 1);
    await assert.rejects(set(c, true), /not_allowed|suspended/);
    await assert.rejects(read(c));
    await db.exec("reset role;update private.accounts set suspended=false");
    await db.exec("update private.preferences set visibility='mutual'");
    assert.deepEqual((await read(b)).rows, []);
    await assert.rejects(set(b, true));
    await db.exec(
      "reset role;update private.preferences set visibility='public'",
    );
    await set(b, false);
    await set(b, false);
    assert.equal(Number((await read(a)).rows[0].total), 1);
    assert.equal((await read(c)).rows[0].liked, true);
    await set(a, true);
    assert.equal(Number((await read(a)).rows[0].total), 2);
    await set(a, false);
    await assert.rejects(read(null));
    await assert.rejects(set(null, true));
    await assert.rejects(as(b, "select * from private.post_reactions"));
    await assert.rejects(
      as(
        b,
        "insert into private.post_reactions(post_id,user_id) values($1,$2)",
        [post, a],
      ),
    );
    await assert.rejects(
      as(b, "select * from public.read_post_reactions($1)", [
        Array(21).fill(post),
      ]),
      /invalid_posts/,
    );
    await assert.rejects(
      as(b, "select * from public.read_post_reactions($1)", [[null]]),
      /invalid_posts/,
    );
    await db.exec("reset role");
    await db.query(
      "update private.rate_counters set hits=500 where user_id=$1 and action in ('reaction:minute','reaction:day')",
      [b],
    );
    await assert.rejects(set(b, true), /rate_limited/);
    assert.equal((await read(b)).rows[0].liked, false);
    await as(a, "select public.remove_post($1)", [post]);
    await db.exec("reset role");
    assert.equal(
      Number(
        (await db.query<any>("select count(*) n from private.post_reactions"))
          .rows[0].n,
      ),
      0,
    );
    assert.deepEqual((await read(a)).rows, []);
  } finally {
    await db.close();
  }
});
