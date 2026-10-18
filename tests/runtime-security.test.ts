import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyMonitorToken, monitorAudience } from "../src/lib/monitor-oidc";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("monitor OIDC requires signature, expiry and exact repository/workflow identity", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const claims = {
    sub: "repo:jphacks/sp_2606:ref:refs/heads/main",
    repository: "jphacks/sp_2606",
    repository_id: "1400418256",
    repository_owner_id: "10176253",
    ref: "refs/heads/main",
    workflow_ref:
      "jphacks/sp_2606/.github/workflows/runtime-monitor.yml@refs/heads/main",
    event_name: "workflow_dispatch",
  };
  const sign = (changes: Record<string, unknown> = {}) =>
    new SignJWT({ ...claims, ...changes })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://token.actions.githubusercontent.com")
      .setAudience(monitorAudience)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
  await verifyMonitorToken(await sign(), keys);
  // A customized subject does not broaden the immutable repository/workflow checks.
  await verifyMonitorToken(await sign({ sub: "customized-subject" }), keys);
  await assert.rejects(verifyMonitorToken(await sign({ sub: "" }), keys));
  for (const changes of [
    { repository_id: "1" },
    { repository: "attacker/repo" },
    { ref: "refs/heads/other" },
    {
      workflow_ref: "jphacks/sp_2606/.github/workflows/ci.yml@refs/heads/main",
    },
    { event_name: "pull_request" },
  ])
    await assert.rejects(verifyMonitorToken(await sign(changes), keys));
  await assert.rejects(verifyMonitorToken("invalid", keys));
  const expired = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://token.actions.githubusercontent.com")
    .setAudience(monitorAudience)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(privateKey);
  await assert.rejects(verifyMonitorToken(expired, keys));
  const wrongAudience = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://token.actions.githubusercontent.com")
    .setAudience("other")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
  await assert.rejects(verifyMonitorToken(wrongAudience, keys));
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://token.actions.githubusercontent.com")
    .setAudience(monitorAudience)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(other.privateKey);
  await assert.rejects(verifyMonitorToken(forged, keys));
});

test("public asset fetcher bounds bytes and follows only same-origin Next JS", async () => {
  const modulePath = new URL(
    "../scripts/security/public-assets.mjs",
    import.meta.url,
  ).href;
  const { scanAssets, publicOrigin } = await import(modulePath);
  const dir = await mkdtemp(join(tmpdir(), "costep-public-test-"));
  try {
    const calls: string[] = [];
    const request = async (url: string, options: any) => {
      calls.push(url);
      assert.equal(options.redirect, "error");
      return new Response(
        url.endsWith("/")
          ? `<script src="/_next/static/app.js"></script><script src="https://evil.invalid/leak.js"></script><script src="http://127.0.0.1/secret.js"></script>`
          : "console.log('demo');",
      );
    };
    assert.equal((await scanAssets(dir, request)).files, 2);
    assert.deepEqual(calls, [
      publicOrigin + "/",
      publicOrigin + "/_next/static/app.js",
    ]);
    await assert.rejects(
      scanAssets(dir, async () => new Response("x".repeat(2_000_001))),
      /size_limit/,
    );
    await assert.rejects(
      scanAssets(dir, async () => new Response("<html></html>")),
      /no_javascript/,
    );
    await assert.rejects(
      scanAssets(dir, async () => new Response("bad", { status: 503 })),
      /fetch_failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime alerts use fixed aggregate thresholds and reject malformed counters", async () => {
  const { assessMetrics } = await import(
    new URL("../scripts/security/runtime-check.mjs", import.meta.url).href
  );
  const value = (counts: unknown[]) => ({
    version: 1,
    window_minutes: 30,
    counts,
  });
  assert.deepEqual(assessMetrics(value([])).alerts, []);
  assert.deepEqual(
    assessMetrics(value([{ scope: "login", outcome: "rejected", total: 29 }]))
      .alerts,
    [],
  );
  assert.deepEqual(
    assessMetrics(value([{ scope: "login", outcome: "rejected", total: 30 }]))
      .alerts,
    ["login_rejections"],
  );
  assert.deepEqual(
    assessMetrics(
      value([
        { scope: "login", outcome: "rejected", total: 30 },
        { scope: "login", outcome: "ok", total: 100 },
      ]),
    ).alerts,
    [],
  );
  assert(
    assessMetrics(
      value([{ scope: "mfa", outcome: "rejected", total: 20 }]),
    ).alerts.includes("mfa_rejections"),
  );
  assert(
    assessMetrics(
      value([{ scope: "password_email", outcome: "ok", total: 15 }]),
    ).alerts.includes("password_email_volume"),
  );
  assert(
    assessMetrics(
      value([{ scope: "mfa_recovery", outcome: "ok", total: 15 }]),
    ).alerts.includes("mfa_recovery_volume"),
  );
  assert(
    assessMetrics(
      value([{ scope: "mfa", outcome: "error", total: 5 }]),
    ).alerts.includes("server_errors"),
  );
  for (const row of [
    { scope: "secret", outcome: "ok", total: 1 },
    { scope: "login", outcome: "ok", total: -1 },
    { scope: "login", outcome: "ok", total: "1" },
  ])
    assert.throws(() => assessMetrics(value([row])));
  assert.throws(() =>
    assessMetrics(
      value([
        { scope: "login", outcome: "ok", total: 1 },
        { scope: "login", outcome: "ok", total: 1 },
      ]),
    ),
  );
});

test("runtime notification contains fixed labels only and throttles existing incidents", async () => {
  const { writeFile, readFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "costep-runtime-notify-"));
  try {
    const preload = join(dir, "mock.mjs"),
      report = join(dir, "report.json"),
      capture = join(dir, "capture.json");
    await writeFile(
      preload,
      `import{writeFileSync}from'node:fs';const calls=[];
      globalThis.fetch=async(url,init)=>{calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(calls));
      if(process.env.TEST_FAILURE) return new Response('{}',{status:403});
      let value=init.method==='GET'?[]:{number:7};
      if(process.env.TEST_EXISTING&&url.includes('/issues?'))value=[{number:7,title:'[Security] 公開サイト・認証監視：確認が必要です',user:{login:'github-actions[bot]'},created_at:new Date().toISOString(),comments:0}];
      return new Response(JSON.stringify(value),{status:200});};`,
    );
    const env = {
      NODE_ENV: "test" as const,
      GITHUB_REPOSITORY: "jphacks/sp_2606",
      GITHUB_RUN_ID: "123",
      GH_TOKEN: "synthetic-token",
      TEST_CAPTURE: capture,
    };
    const args = [
      "--import",
      preload,
      "scripts/security/notify-runtime.mjs",
      report,
    ];
    await writeFile(
      report,
      JSON.stringify({
        version: 1,
        window_minutes: 30,
        alerts: ["login_rejections"],
        ignored: "personal@example.invalid",
      }),
    );
    execFileSync(process.execPath, args, { env, stdio: "pipe" });
    let calls = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body.assignees, ["ryo7-7"]);
    assert(!JSON.stringify(calls).includes("personal@example.invalid"));
    assert(!JSON.stringify(calls).includes(env.GH_TOKEN));
    execFileSync(process.execPath, args, {
      env: { ...env, TEST_EXISTING: "1" },
      stdio: "pipe",
    });
    calls = JSON.parse(await readFile(capture, "utf8"));
    assert(calls.every((c: any) => c.method === "GET"));
    assert.throws(() =>
      execFileSync(process.execPath, args, {
        env: { ...env, TEST_FAILURE: "1" },
        stdio: "pipe",
      }),
    );
    await writeFile(
      report,
      JSON.stringify({
        version: 1,
        window_minutes: 30,
        alerts: ["untrusted alert"],
      }),
    );
    assert.throws(() =>
      execFileSync(process.execPath, args, { env, stdio: "pipe" }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
