import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "../scripts/backup/archive.mjs";
test("deletion IDs are admin-only, expire after eight days and reapply in an isolated encrypted restore", async () => {
  const db = new PGlite();
  let restored: PGlite | undefined;
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema private;create schema auth;create table auth.users(id uuid primary key);create table public.notes(user_id uuid references auth.users(id) on delete cascade,body text)",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610180024_security_metrics.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610190027_retention.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const id = "00000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into public.notes values($1,'synthetic only')", [
      id,
    ]);
    const snapshot = await db.dumpDataDir();
    const key = randomBytes(32).toString("base64");
    const encrypted = seal(
      Buffer.from(await snapshot.arrayBuffer()),
      key,
      new Date(),
    );
    await db.query("delete from auth.users where id=$1", [id]);
    assert.equal((await db.query("select * from public.notes")).rows.length, 0);
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(db.query("select * from private.account_deletions"));
      await assert.rejects(
        db.query("select public.export_account_deletions()"),
      );
      await assert.rejects(db.query("select public.cleanup_retained_data()"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const journal = (
      await db.query<any>("select public.export_account_deletions() data")
    ).rows[0].data;
    await db.exec("reset role");
    assert.equal(journal.records[0].user_id, id);
    restored = new PGlite({
      loadDataDir: new Blob([unseal(encrypted, key, new Date()).data]),
    });
    assert.equal(
      (await restored.query("select * from public.notes")).rows.length,
      1,
    );
    for (const record of journal.records)
      await restored.query("delete from auth.users where id=$1", [
        record.user_id,
      ]);
    assert.equal(
      (await restored.query("select * from public.notes")).rows.length,
      0,
    );
    await db.exec(
      "update private.account_deletions set deleted_at=clock_timestamp()-interval '9 days';set role service_role",
    );
    await db.exec("select public.cleanup_retained_data();reset role");
    assert.equal(
      (await db.query("select * from private.account_deletions")).rows.length,
      0,
    );
  } finally {
    await db.close();
    if (restored) await restored.close();
  }
});
