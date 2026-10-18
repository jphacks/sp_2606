import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { incidentMode, sessionAllowedSince } from "../src/lib/incident-policy";
import { proxy } from "../src/proxy";
import { readFile } from "node:fs/promises";

test("incident switches fail closed, cutoff keeps fresh sessions only", () => {
  assert.equal(incidentMode({}), "none");
  assert.equal(incidentMode({ COSTEP_INCIDENT_MODE: "recovery" }), "recovery");
  assert.equal(incidentMode({ COSTEP_INCIDENT_MODE: "typo" }), "all");
  const env = { SESSION_NOT_BEFORE: "2026-10-18T05:00:00Z" };
  const cutoff = Date.parse(env.SESSION_NOT_BEFORE);
  assert.equal(sessionAllowedSince(cutoff - 1, env), false);
  assert.equal(sessionAllowedSince(cutoff, env), true);
  assert.equal(sessionAllowedSince(cutoff + 1, env), true);
  assert.equal(
    sessionAllowedSince(cutoff, { SESSION_NOT_BEFORE: "invalid" }),
    false,
  );
  assert.equal(sessionAllowedSince(cutoff, {}), true);
});

test("emergency proxy stops pages and APIs, clears cookies and never caches", async () => {
  const old = process.env.COSTEP_INCIDENT_MODE;
  try {
    process.env.COSTEP_INCIDENT_MODE = "all";
    for (const path of [
      "/",
      "/api/mutate/post",
      "/auth/callback",
      "/reset-password",
    ]) {
      const res = proxy(new NextRequest(`https://example.com${path}`));
      assert.equal(res.status, 503);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.equal(res.headers.get("Retry-After"), "300");
      assert(
        res.cookies
          .getAll()
          .some((c) => c.name === "__Host-sc-session" && c.maxAge === 0),
      );
      assert(!(await res.text()).includes("SECRET"));
    }
    process.env.COSTEP_INCIDENT_MODE = "recovery";
    assert.equal(proxy(new NextRequest("https://example.com/")).status, 200);
    process.env.COSTEP_INCIDENT_MODE = "unknown";
    assert.equal(
      proxy(new NextRequest("https://example.com/api/data")).status,
      503,
    );
  } finally {
    if (old === undefined) delete process.env.COSTEP_INCIDENT_MODE;
    else process.env.COSTEP_INCIDENT_MODE = old;
  }
});

test("classification exports counts only; arbitrary scanner content cannot enter notifications", async () => {
  // These are standalone Node CLI modules; load at runtime so no declaration shim is needed.
  const modulePath = new URL(
    "../scripts/security/incident-report.mjs",
    import.meta.url,
  ).href;
  const { classify, validateReport } = await import(modulePath);
  const secret = "private-test-" + "x".repeat(40);
  const report = classify([
    {
      RuleID: "costep-session-key",
      Secret: secret,
      Match: secret,
      File: secret,
    },
    { RuleID: "costep-smtp-password", Secret: secret },
    { RuleID: "costep-supabase-secret", Secret: secret },
    { RuleID: "unknown\n" + secret, Secret: secret },
  ]);
  assert.deepEqual(report.counts, {
    session: 1,
    mail: 1,
    supabase: 1,
    other: 1,
  });
  assert(!JSON.stringify(report).includes(secret));
  assert.deepEqual(validateReport(report), report);
  assert.throws(() => validateReport({ ...report, Secret: secret }));
  assert.throws(() =>
    validateReport({ version: 1, counts: { ...report.counts, other: -1 } }),
  );
  assert.throws(() => classify(null));
});

test("incident notification only runs for trusted events and never uploads raw scanner reports", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/secrets.yml", import.meta.url),
    "utf8",
  );
  assert(workflow.includes("github.event_name != 'pull_request'"));
  assert(workflow.includes("issues: write"));
  assert(workflow.includes("--redact"));
  assert(!workflow.includes("upload-artifact"));
});

test("notification uses sanitized counts and assigns operator; API failure is not ignored", async () => {
  const {
    mkdtemp,
    writeFile,
    readFile: read,
    rm,
  } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "costep-notification-"));
  try {
    const preload = join(dir, "mock.mjs");
    const capture = join(dir, "calls.json");
    await writeFile(
      preload,
      `import {writeFileSync} from 'node:fs';
      const calls=[];globalThis.fetch=async(url,init)=>{
        calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});
        writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(calls));
        if(process.env.TEST_FAILURE==='1') return new Response('{}',{status:403});
        return new Response(JSON.stringify(init.method==='GET'?[]:{number:7}),{status:200});
      };`,
    );
    const args = ["--import", preload, "scripts/security/notify-incident.mjs"];
    const env = {
      NODE_ENV: "test" as const,
      GITHUB_REPOSITORY: "jphacks/sp_2606",
      GITHUB_RUN_ID: "123",
      GH_TOKEN: "synthetic-test-token",
      SECURITY_CONTACT: "ryo7-7",
      SCAN_RESULT: "failure",
      SCAN_REPORT: JSON.stringify({
        version: 1,
        counts: { supabase: 1, mail: 0, session: 0, other: 0 },
      }),
      TEST_CAPTURE: capture,
    };
    execFileSync(process.execPath, args, { env, stdio: "pipe" });
    const calls = JSON.parse(await read(capture, "utf8"));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body.assignees, ["ryo7-7"]);
    assert(calls[1].body.body.includes("/actions/runs/123"));
    assert(!JSON.stringify(calls).includes(env.GH_TOKEN));
    assert.throws(() =>
      execFileSync(process.execPath, args, {
        env: { ...env, TEST_FAILURE: "1" },
        stdio: "pipe",
      }),
    );
    assert.throws(() =>
      execFileSync(process.execPath, args, {
        env: {
          ...env,
          SCAN_REPORT: JSON.stringify({ version: 1, counts: { supabase: 1 } }),
        },
        stdio: "pipe",
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
