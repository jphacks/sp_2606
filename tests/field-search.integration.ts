import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("field search filters before limits and preserves visibility, blocks, suspension and rate limits", async () => {
  const db = new PGlite();
  const viewer = "00000000-0000-4000-8000-000000000099";
  const demo = (n: number) =>
    `de000001-0000-4000-8000-${String(n).padStart(12, "0")}`;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    await db.query("insert into auth.users(id) values($1)", [viewer]);
    await db.exec(
      await readFile(
        new URL("../supabase/demo/timeline-seed.sql", import.meta.url),
        "utf8",
      ),
    );
    async function as(user: string | null, sql: string, args: unknown[] = []) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return (await db.query<any>(sql, args)).rows;
    }
    const posts = () =>
      as(viewer, "select * from public.search_field_posts('Python')");
    const studies = () =>
      as(viewer, "select * from public.search_field_studies('Python')");
    const azureRecords = await as(viewer, "select * from public.search_field_studies('Microsoft Azure')");
    assert.equal(azureRecords.length, 8);
    assert.ok(azureRecords.some((r) => r.owner_id === demo(7) && r.field === "Python"));
    const py = await posts();
    assert.equal(py.length, 10);
    assert.ok(py.every((r) => !r.body.includes("HIDDEN-") && r.display_name));
    assert.equal((await studies()).length, 14); // learning time stays visible even when prose is private
    assert.equal(
      (await as(viewer, "select * from public.search_field_posts('Go')"))
        .length,
      6,
    );
    await as(viewer, "select public.set_block($1,true)", [demo(1)]);
    assert.equal((await posts()).length, 8);
    assert.equal((await studies()).length, 12);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      demo(2),
    ]);
    assert.equal((await posts()).length, 6);
    assert.equal((await studies()).length, 10);
    await assert.rejects(
      as(null, "select * from public.search_field_posts('Python')"),
      /permission denied/,
    );
    await assert.rejects(
      as(null, "select * from public.search_field_studies('Python')"),
      /permission denied/,
    );
    await assert.rejects(
      as(viewer, "select * from public.posts"),
      /permission denied/,
    );
    await assert.rejects(
      as(viewer, "select * from public.search_field_posts($1)", [
        "x".repeat(31),
      ]),
      /invalid_field/,
    );
    // Dates outside the bounded study window never leak into results.
    await db.exec("reset role");
    await db.query(
      "update public.study_records set study_date=current_date-60 where owner_id=$1",
      [demo(3)],
    );
    assert.equal((await studies()).length, 8);
    await db.exec("reset role");
    await db.query(
      "insert into public.posts(owner_id,body) select $1,'limit test' from generate_series(1,25)",
      [demo(3)],
    );
    assert.equal((await posts()).length, 20);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=true where id=$1", [
      viewer,
    ]);
    await assert.rejects(posts(), /suspended|not_allowed/);
    await db.exec("reset role");
    await db.query("update private.accounts set suspended=false where id=$1", [
      viewer,
    ]);
    let limited = false;
    for (let i = 0; i < 35; i++) {
      try {
        await posts();
      } catch {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true);
  } finally {
    await db.close();
  }
});
