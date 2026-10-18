import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export const publicOrigin = "https://study-circle-pi.vercel.app";
export async function scanAssets(directory, request = fetch) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const queue = [publicOrigin + "/"],
    seen = new Set();
  let total = 0;
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    if (seen.size >= 100) throw new Error("asset_limit");
    seen.add(url);
    const res = await request(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "text/html,application/javascript" },
    });
    if (!res.ok || !res.body) throw new Error("asset_fetch_failed");
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      total += chunk.length;
      if (size > 2_000_000 || total > 20_000_000)
        throw new Error("asset_size_limit");
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    writeFileSync(
      `${directory}/${seen.size === 1 ? "index.html" : `asset-${seen.size}.js`}`,
      body,
      { mode: 0o600 },
    );
    // Follow only same-origin absolute Next static JS references; no source maps or external links.
    const refs = [...body.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(
      (x) => x[1],
    );
    refs.push(
      ...[
        ...body.matchAll(
          /["'](\/_next\/static\/[^"'\s]+\.js(?:\?[^"'\s]*)?)["']/g,
        ),
      ].map((x) => x[1]),
    );
    for (const ref of refs) {
      const candidate = new URL(ref, url);
      if (
        candidate.origin === publicOrigin &&
        !candidate.username &&
        !candidate.password &&
        candidate.pathname.startsWith("/_next/static/") &&
        candidate.pathname.endsWith(".js")
      )
        queue.push(candidate.href);
    }
  }
  if (seen.size < 2) throw new Error("no_javascript_discovered");
  return { files: seen.size, bytes: total };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(await scanAssets(process.argv[2])));
  } catch {
    console.error(
      "Public asset check failed or incomplete; do not interpret as a clean scan.",
    );
    process.exitCode = 2;
  }
}
