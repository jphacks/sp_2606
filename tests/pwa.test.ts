import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import sharp from "sharp";
import manifest from "../src/app/manifest";
test("PWA manifest has standalone launch and correctly sized safe icons", async () => {
  const m = manifest();
  assert.equal(m.id, "/");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  for (const icon of m.icons!) {
    const metadata = await sharp(
      await readFile(new URL("../public" + icon.src, import.meta.url)),
    ).metadata();
    assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
    assert.equal(metadata.format, "png");
  }
  assert(m.icons!.some((i) => i.purpose === "maskable"));
});
test("service worker never intercepts API/auth/RSC/mutations or persists personal data", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  let offline = false;
  const worker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const context = {
    self: {
      location: { origin: "https://costep.test" },
      addEventListener: (name: string, handler: any) =>
        (handlers[name] = handler),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    URL,
    Response,
    fetch: async () => {
      if (offline) throw new TypeError("offline");
      return new Response("private response", { status: 200 });
    },
    caches: new Proxy(
      {},
      {
        get() {
          throw new Error("Cache Storage must not be used");
        },
      },
    ),
  };
  vm.runInNewContext(worker, context);
  function dispatch(path: string, mode = "navigate", method = "GET"): Promise<Response> | null {
    let response: Promise<Response> | null = null;
    handlers.fetch({
      request: { url: new URL(path, "https://costep.test").href, mode, method },
      respondWith: (r: Promise<Response>) => (response = r),
    });
    return response;
  }
  for (const path of [
    "/api/data",
    "/api/messages",
    "/api/session",
    "/api/avatar/id",
    "/auth/callback?code=secret",
    "/reset-password",
    "https://other.test/",
  ])
    assert.equal(dispatch(path), null);
  assert.equal(dispatch("/?_rsc=1", "cors"), null);
  assert.equal(dispatch("/", "navigate", "POST"), null);
  const online = await dispatch("/")!;
  assert.equal(await online.text(), "private response");
  offline = true;
  const fallback = await dispatch("/")!;
  assert.equal(fallback.status, 503);
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  const html = await fallback.text();
  assert(html.includes("インターネットに接続"));
  assert(!html.includes("private response"));
  assert(
    fallback.headers
      .get("content-security-policy")
      ?.includes("default-src 'none'"),
  );
});
