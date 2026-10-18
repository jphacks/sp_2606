import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
test("HTTP: unauthenticated access and CSRF/Origin protections fail closed", async () => {
  const session = await fetch(base + "/api/session");
  assert.equal(session.status, 200);
  const data = await session.json();
  assert.equal(data.user, null);
  assert(!("SUPABASE_URL" in data));
  const raw = session.headers.getSetCookie();
  const cookie = raw.map((c) => c.split(";")[0]).join("; ");
  assert(raw.some((c) => c.includes("HttpOnly") && c.includes("SameSite=lax")));
  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
    "x-csrf-token": data.csrf,
    Origin: base,
  };
  assert.equal((await fetch(base + "/api/data")).status, 401);
  assert.equal((await fetch(base + "/api/security-monitor")).status, 401);
  assert.equal((await fetch(base + "/api/mfa")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/mfa", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "verify",
          factorId: "00000000-0000-4000-8000-000000000001",
          code: "123456",
        }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/mfa/recovery", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send",
          password: "not-a-real-password",
        }),
      })
    ).status,
    401,
  );

  assert.equal(
    (await fetch(base + "/api/avatar/00000000-0000-4000-8000-000000000001"))
      .status,
    401,
  );
  assert.equal(
    (await fetch(base + "/api/study-dashboard?month=2026-10")).status,
    401,
  );
  assert.equal(
    (await fetch(base + "/api/search?field=Python&kind=posts")).status,
    401,
  );
  assert.equal(
    (await fetch(base + "/api/search?field=Python&kind=studies")).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/mutate/post", {
        method: "POST",
        headers,
        body: JSON.stringify({ body: "unauthorized" }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/mutate/post", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/mutate/post", {
        method: "POST",
        headers: { ...headers, "x-csrf-token": "invalid" },
        body: "{}",
      })
    ).status,
    400,
  );
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const csp = page.headers.get("Content-Security-Policy") || "";
  assert(csp.includes("object-src 'none'"));
  assert(csp.includes("frame-ancestors 'none'"));
  assert(csp.includes("'nonce-"));
  assert.equal(page.headers.get("X-Content-Type-Options"), "nosniff");
});
