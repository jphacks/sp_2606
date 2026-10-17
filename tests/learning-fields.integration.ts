import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
test("multi-field profiles: migration preserves experience, direct RPC validation and similar feed privacy", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of [
      "202610170001_foundation.sql",
      "202610170002_conversations.sql",
      "202610170003_follow_approval.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    for (const id of [A, B])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update public.profiles set field='AWS',level=2 where id=$1",
      [A],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610170004_learning_fields.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    async function as(id: string | null, sql: string, params: unknown[] = []) {
      await db.exec(`reset role;set role ${id ? "authenticated" : "anon"}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id || "",
      ]);
      return db.query<any>(sql, params);
    }
    const level = (field: string, n = 1) => ({
      field,
      mode: "level",
      level: n,
      total_minutes: null,
    });
    const time = (field: string, n = 7200) => ({
      field,
      mode: "time",
      level: null,
      total_minutes: n,
    });
    const save = (id: string, items: unknown, visibility = "public") =>
      as(
        id,
        "select public.save_profile_fields('Name',$1,'goal','bio',true,$2,'mutual')",
        [JSON.stringify(items), visibility],
      );
    const profile = async (id: string) =>
      (await as(id, "select * from public.read_profile($1)", [id])).rows[0];
    assert.deepEqual((await profile(A)).learning_fields, [level("AWS", 2)]);
    await save(A, [level("Python"), time("AWS")]);
    assert.deepEqual((await profile(A)).learning_fields, [
      level("Python"),
      time("AWS"),
    ]);
    assert.deepEqual(
      (
        await as(
          A,
          "select * from public.read_study($1,current_date-6,current_date)",
          [A],
        )
      ).rows,
      [],
      "self-reported cumulative time is not a daily study record",
    );
    await assert.rejects(
      as(
        null,
        "select public.save_profile_fields('fake',$1,'','',true,'public','mutual')",
        [JSON.stringify([level("AWS")])],
      ),
    );
    await assert.rejects(
      as(B, "update public.profiles set learning_fields=$1 where id=$2", [
        JSON.stringify([level("AWS")]),
        A,
      ]),
    );
    for (const invalid of [
      [],
      {},
      [level("AWS"), level("AWS")],
      [level("AWS"), level("aws")],
      [{ ...time("AWS"), level: 1 }],
      [{ ...level("AWS"), total_minutes: 2 }],
      [time("AWS", -1)],
      [time("AWS", 0.5)],
      [time("AWS", 6000001)],
      [{ ...level("AWS"), owner_id: B }],
      Array.from({ length: 11 }, (_, i) => level("f" + i)),
    ])
      await assert.rejects(save(A, invalid), /invalid_learning_fields/);
    assert.deepEqual(
      (await profile(A)).learning_fields,
      [level("Python"), time("AWS")],
      "invalid saves roll back",
    );
    await as(
      A,
      "select public.save_profile('Old client','Python',1,'','',true,'public','mutual')",
    );
    assert.equal(
      (await profile(A)).learning_fields.length,
      2,
      "legacy editor cannot silently erase multiple fields",
    );
    await assert.rejects(
      as(
        A,
        "select public.save_profile('Old client','AWS',2,'','',true,'public','mutual')",
      ),
      /refresh_profile_editor/,
    );
    await save(B, [time("AWS", 7800)]);
    await as(B, "select public.create_post('time post')");
    assert.equal(
      (await as(A, "select * from public.read_posts('similar')")).rows.length,
      1,
      "secondary field matches similar time",
    );
    await save(B, [level("AWS", 1)]);
    assert.equal(
      (await as(A, "select * from public.read_posts('similar')")).rows.length,
      0,
      "time is not converted into level",
    );
    await save(B, [level("Python", 2)], "mutual");
    assert.equal(
      (await as(A, "select * from public.read_posts('similar')")).rows.length,
      0,
      "similarity cannot expose mutual-only posts",
    );
    await save(B, [level("Python", 2)]);
    assert.equal(
      (await as(A, "select * from public.read_posts('similar')")).rows.length,
      1,
    );
    await save(B, [time("AWS", 60000)]);
    assert.equal(
      (await as(A, "select * from public.read_posts('similar')")).rows.length,
      0,
    );
    await as(B, "select public.set_block($1,true)", [A]);
    assert.equal(
      (await as(A, "select * from public.read_profile($1)", [B])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
