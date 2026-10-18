import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const databaseOnly = process.argv[2] === "db";
const files = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name !== "http.integration.ts")
  .filter((name) => name.endsWith(".integration.ts") || (!databaseOnly && name.endsWith(".test.ts")))
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw new Error("No tests discovered");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
