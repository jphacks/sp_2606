import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const oldSid = "00000000-0000-4000-8000-000000000011",
  newSid = "00000000-0000-4000-8000-000000000012";
test("MFA direct SQL rejects aal1, locks email recovery, revokes old tokens and requires reenrollment", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.exec(
      "update private.preferences set profile_completed=true,visibility='public'",
    );
    const now = Math.floor(Date.now() / 1000);
    async function as(
      user: string | null,
      aal = "aal1",
      sid = oldSid,
      iat = now,
      sql = "select public.get_settings()",
      params: unknown[] = [],
    ) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
        [user || "", JSON.stringify({ sub: user, aal, session_id: sid, iat })],
      );
      return db.query<any>(sql, params);
    }
    async function admin(sql: string, params: unknown[] = []) {
      await db.exec("reset role;set role service_role");
      return db.query<any>(sql, params);
    }
    await as(a);
    await db.exec("reset role");
    await db.query(
      "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",
      [a],
    );
    await assert.rejects(as(a));
    await assert.rejects(
      as(a, "aal1", oldSid, now, "select public.read_activity_feed()"),
    );
    await assert.rejects(
      as(a, "aal1", oldSid, now, "select public.read_inbox()"),
    );
    await as(a, "aal2");
    await as(b);
    await assert.rejects(
      as(a, "aal1", oldSid, now, "select public.complete_mfa_reenrollment()"),
    );
    const request = "00000000-0000-4000-8000-000000000021",
      hash = "a".repeat(64);
    await assert.rejects(
      as(
        a,
        "aal1",
        oldSid,
        now,
        "select public.begin_mfa_email_recovery($1,$2,$3)",
        [a, request, hash],
      ),
    );
    await admin("select public.begin_mfa_email_recovery($1,$2,$3)", [
      a,
      request,
      hash,
    ]);
    await assert.rejects(
      admin("select public.begin_mfa_email_recovery($1,$2,$3)", [
        a,
        request,
        hash,
      ]),
    );
    // Wrong account and request do not authorize recovery.
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          b,
          request,
          hash,
        ])
      ).rows[0].ok,
      false,
    );
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
            a,
            request,
            "b".repeat(64),
          ])
        ).rows[0].ok,
        false,
      );
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          request,
          hash,
        ])
      ).rows[0].ok,
      false,
      "five failures consume authorization",
    );
    await db.exec(
      "reset role;update private.mfa_email_recovery set sent_at=now()-interval '61 seconds'",
    );
    const req2 = "00000000-0000-4000-8000-000000000022";
    await admin("select public.begin_mfa_email_recovery($1,$2,$3)", [
      a,
      req2,
      hash,
    ]);
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          request,
          hash,
        ])
      ).rows[0].ok,
      false,
      "resend invalidates old request",
    );
    await db.exec(
      "reset role;update private.mfa_email_recovery set expires_at=now()-interval '1 second'",
    );
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          req2,
          hash,
        ])
      ).rows[0].ok,
      false,
      "expired code denied",
    );
    await db.exec(
      "reset role;update private.mfa_email_recovery set expires_at=now()+interval '10 minutes'",
    );
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          req2,
          hash,
        ])
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          req2,
          hash,
        ])
      ).rows[0].ok,
      false,
      "consumed code cannot replay",
    );
    await assert.rejects(as(a, "aal2"));
    // Deleting Auth factors must not unlock the account during recovery.
    await db.exec("reset role");
    await db.query("delete from auth.mfa_factors where user_id=$1", [a]);
    await assert.rejects(as(a, "aal1", newSid, now + 120));
    await admin("select public.authorize_mfa_reenrollment($1,$2)", [a, newSid]);
    await db.exec("reset role");
    await db.query(
      "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",
      [a],
    );
    await assert.rejects(
      as(
        a,
        "aal1",
        newSid,
        now + 120,
        "select public.complete_mfa_reenrollment()",
      ),
    );
    await assert.rejects(
      as(a, "aal2", oldSid, now, "select public.complete_mfa_reenrollment()"),
    );
    await as(
      a,
      "aal2",
      newSid,
      now,
      "select public.complete_mfa_reenrollment()",
    );
    await as(a, "aal2", newSid, now);
    await assert.rejects(
      as(a, "aal2", oldSid, now - 5),
      "old JWT denied even after recovery completes",
    );
    await as(a, "aal2", oldSid, now + 120);
    await as(b);
    await assert.rejects(as(null));
    // Lost-phone recovery now allows an aal1 session after all old factors are removed.
    const req3 = "00000000-0000-4000-8000-000000000023";
    const recoveredSid = "00000000-0000-4000-8000-000000000013";
    await db.exec(
      "reset role;update private.mfa_email_recovery set sent_at=now()-interval '61 seconds'",
    );
    await admin("select public.begin_mfa_email_recovery($1,$2,$3)", [
      a,
      req3,
      hash,
    ]);
    assert.equal(
      (
        await admin("select public.verify_mfa_email_recovery($1,$2,$3) ok", [
          a,
          req3,
          hash,
        ])
      ).rows[0].ok,
      true,
    );
    await assert.rejects(
      as(
        a,
        "aal1",
        recoveredSid,
        now,
        "select public.complete_mfa_email_recovery($1,$2,$3)",
        [a, req3, recoveredSid],
      ),
    );
    await assert.rejects(
      admin("select public.complete_mfa_email_recovery($1,$2,$3)", [
        a,
        req3,
        recoveredSid,
      ]),
      "must remove old factors before unlocking",
    );
    await db.exec("reset role");
    await db.query("delete from auth.mfa_factors where user_id=$1", [a]);
    await assert.rejects(
      admin("select public.complete_mfa_email_recovery($1,$2,$3)", [
        a,
        req2,
        recoveredSid,
      ]),
      "a different recovery request cannot unlock",
    );
    await assert.rejects(as(a, "aal1", recoveredSid, now));
    await admin("select public.complete_mfa_email_recovery($1,$2,$3)", [
      a,
      req3,
      recoveredSid,
    ]);
    await as(a, "aal1", recoveredSid, now);
    await assert.rejects(
      as(a, "aal2", oldSid, now - 5),
      "old JWT stays revoked after MFA is disabled",
    );
    await as(a, "aal1", newSid, now + 120);
    await assert.rejects(
      admin("select public.complete_mfa_email_recovery($1,$2,$3)", [
        a,
        req3,
        recoveredSid,
      ]),
      "completion cannot replay",
    );
    await db.exec("reset role");
    await db.query(
      "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",
      [a],
    );
    await assert.rejects(
      as(a, "aal1", recoveredSid, now),
      "reenabling MFA requires its code again",
    );
    await as(a, "aal2", recoveredSid, now);
  } finally {
    await db.close();
  }
});
