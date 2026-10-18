import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("security metrics deny anonymous/users and retain bounded aggregate data only", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema private;",
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
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(db.query("select public.read_security_metrics()"));
      await assert.rejects(
        db.query("select public.record_security_metric('login','rejected')"),
      );
      await assert.rejects(
        db.query("select * from private.security_event_counters"),
      );
      await db.exec("reset role");
    }
    await db.exec(
      "insert into private.security_event_counters values(now()-interval '8 days','login','ok',1);set role service_role;",
    );
    await db.query("select public.record_security_metric('login','rejected')");
    await db.query("select public.record_security_metric('login','rejected')");
    await assert.rejects(
      db.query(
        "select public.record_security_metric('email@example.com','ok')",
      ),
    );
    const metrics = (
      await db.query<any>("select public.read_security_metrics() m")
    ).rows[0].m;
    assert.deepEqual(metrics.counts, [
      { scope: "login", outcome: "rejected", total: 2 },
    ]);
    await db.exec("reset role");
    const columns = (
      await db.query<any>(
        "select column_name from information_schema.columns where table_schema='private' and table_name='security_event_counters' order by ordinal_position",
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(columns, ["bucket", "scope", "outcome", "total"]);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from private.security_event_counters",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
