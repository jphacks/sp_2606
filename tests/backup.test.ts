import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readdir,
  stat,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  seal,
  unseal,
  writeArchive,
  prune,
  loopbackConnection,
  RETENTION_MS,
} from "../scripts/backup/archive.mjs";
test("encrypted archives reject tampering, wrong key, future metadata and expired data", () => {
  const key = randomBytes(32).toString("base64"),
    now = new Date("2026-10-19T00:00:00Z");
  const secret = Buffer.from("PRIVATE synthetic database content");
  const bytes = seal(secret, key, now);
  assert(!bytes.includes(secret));
  assert.deepEqual(unseal(bytes, key, now).data, secret);
  const bad = Buffer.from(bytes);
  bad[bad.length - 20] ^= 1;
  assert.throws(() => unseal(bad, key, now));
  assert.throws(() => unseal(bytes, randomBytes(32).toString("base64"), now));
  assert.throws(() => unseal(bytes, key, new Date(+now + RETENTION_MS)));
  const header = Buffer.from(bytes);
  header[25] ^= 1;
  assert.throws(() => unseal(header, key, now));
  assert.throws(() =>
    loopbackConnection("postgres://u:p@db.example.com/postgres"),
  );
  assert.equal(
    loopbackConnection("postgres://u:p@127.0.0.1/costep_restore_test_demo")
      .hostname,
    "127.0.0.1",
  );
});
test("retention removes authenticated expired archives only, with private permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "costep-backup-test-"));
  const key = randomBytes(32).toString("base64"),
    now = new Date();
  try {
    const old = await writeArchive(
      dir,
      Buffer.from("old"),
      key,
      new Date(+now - 8 * 86400000),
    );
    const current = await writeArchive(dir, Buffer.from("new"), key, now);
    await writeFile(join(dir, "costep-tampered.csbk"), "bad");
    await writeFile(join(dir, "keep.txt"), "keep");
    assert.equal((await stat(current)).mode & 0o077, 0);
    const result = await prune(dir, key, now);
    assert.equal(result.removed, 1);
    assert.equal(result.invalid, 1);
    const files = await readdir(dir);
    assert(files.includes("keep.txt"));
    assert(!files.includes(old.split("/").pop()!));
    assert(files.includes(current.split("/").pop()!));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
