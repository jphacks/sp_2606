import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
test("current migrations: follow approval, migration consent reset, onboarding and profile privacy", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const file of [
      "202610170001_foundation.sql",
      "202610170002_conversations.sql",
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
      "insert into private.follows(follower,following) values($1,$2),($2,$1)",
      [A, B],
    );
    await db.query(
      "update public.profiles set display_name='Existing user' where id=$1",
      [A],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610170003_follow_approval.sql",
          import.meta.url,
        ),
        "utf8",
      ),
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
    await db.query(
      `insert into auth.users(id,raw_user_meta_data) values($1,'{"visibility":"public","profile_completed":true}')`,
      [C],
    );
    async function as(id: string | null, sql: string, params: unknown[] = []) {
      await db.exec(`reset role; set role ${id ? "authenticated" : "anon"}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id || "",
      ]);
      return db.query<any>(sql, params);
    }
    const value = async (id: string, sql: string, params: unknown[] = []) =>
      Object.values((await as(id, sql, params)).rows[0])[0] as any;
    assert.equal(
      (await value(A, "select public.get_settings()")).profile_completed,
      true,
    );
    const cSettings = await value(C, "select public.get_settings()");
    assert.equal(cSettings.visibility, "mutual");
    assert.equal(cSettings.profile_completed, false);
    await assert.rejects(
      as(C, "select public.create_post('cannot publish before setup')"),
      /profile_required/,
    );
    const initial = await value(A, "select public.get_connections()");
    assert.deepEqual(initial.following, []);
    assert.deepEqual(initial.outgoing, [B]);
    assert.deepEqual(initial.incoming, [B]);
    assert.equal(
      (await value(A, "select public.profile_counts($1)", [A])).followers,
      0,
    );
    await assert.rejects(
      as(null, "select public.respond_follow($1,true)", [A]),
    );
    await assert.rejects(
      as(C, "select public.respond_follow($1,true)", [A]),
      /no_pending_request/,
    );
    await as(B, "select public.respond_follow($1,true)", [A]);
    assert.deepEqual(
      (await value(A, "select public.get_connections()")).following,
      [B],
    );
    // A has not accepted B, so a single approval cannot reveal mutual-only posts or enable mutual DM.
    await as(A, "select public.create_post('mutual secret')");
    assert.equal(
      (await as(B, "select * from public.read_profile_posts($1)", [A])).rows
        .length,
      0,
    );
    assert.equal(
      (await value(B, "select public.dm_status($1)", [A])).can_contact,
      false,
    );
    await as(A, "select public.respond_follow($1,true)", [B]);
    assert.equal(
      (await as(B, "select * from public.read_profile_posts($1)", [A])).rows
        .length,
      1,
    );
    assert.equal(
      (await value(B, "select public.dm_status($1)", [A])).can_contact,
      true,
    );
    await as(B, "select public.set_follow($1,false)", [A]);
    assert.equal(
      (await as(B, "select * from public.read_profile_posts($1)", [A])).rows
        .length,
      0,
    );
    await as(B, "select public.set_follow($1,true)", [A]);
    await as(B, "select public.set_follow($1,true)", [A]);
    assert.equal(
      (await as(B, "select * from public.read_profile_posts($1)", [A])).rows
        .length,
      0,
    );
    await as(A, "select public.respond_follow($1,false)", [B]);
    assert.deepEqual(
      (await value(B, "select public.get_connections()")).outgoing,
      [],
    );
    await as(
      C,
      "select public.save_profile('C','Python',0,'goal','bio',true,'public','mutual')",
    );
    await as(C, "select public.create_post('public post')");
    await as(A, "select public.set_follow($1,true)", [C]);
    assert.equal(
      (await as(A, "select * from public.read_posts('following')")).rows.length,
      0,
      "pending public author excluded from following feed",
    );
    await as(C, "select public.respond_follow($1,true)", [A]);
    assert.equal(
      (await as(A, "select * from public.read_posts('following')")).rows.length,
      1,
    );
    assert.equal(
      (await as(A, "select * from public.read_profile($1)", [C])).rows.length,
      1,
    );
    await assert.rejects(as(A, "select * from private.follows"));
    await as(C, "select public.set_block($1,true)", [A]);
    assert.equal(
      (await as(A, "select * from public.read_profile($1)", [C])).rows.length,
      0,
    );
    assert.equal(
      (await as(A, "select * from public.read_profile_posts($1)", [C])).rows
        .length,
      0,
    );
    await assert.rejects(
      as(A, "select public.set_follow($1,true)", [C]),
      /not_allowed/,
    );
    await as(C, "select public.set_block($1,false)", [A]);
    assert(
      !(await value(A, "select public.get_connections()")).following.includes(
        C,
      ),
    );
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      B,
    ]);
    await assert.rejects(
      as(B, "select public.respond_follow($1,true)", [A]),
      /not_allowed/,
    );
    assert.equal(
      (await as(A, "select * from public.read_profile($1)", [B])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
