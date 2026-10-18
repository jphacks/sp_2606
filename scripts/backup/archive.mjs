import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  open,
  mkdir,
  readdir,
  stat,
  lstat,
  unlink,
  readFile,
} from "node:fs/promises";
import path from "node:path";
const MAGIC = Buffer.from("COSTEPBK1");
export const RETENTION_MS = 7 * 86400000;
export function validKey(value) {
  const b = Buffer.from(value || "", "base64");
  if (b.length !== 32 || b.toString("base64") !== value)
    throw new Error("invalid_backup_key");
  return b;
}
export function seal(data, key, now = new Date()) {
  const iv = randomBytes(12),
    header = Buffer.from(
      JSON.stringify({
        version: 1,
        created_at: now.toISOString(),
        expires_at: new Date(+now + RETENTION_MS).toISOString(),
      }),
    );
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  const prefix = Buffer.concat([MAGIC, len, header, iv]);
  const cipher = createCipheriv("aes-256-gcm", validKey(key), iv);
  cipher.setAAD(prefix);
  return Buffer.concat([
    prefix,
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}
export function unseal(bytes, key, now = new Date()) {
  if (bytes.length < 50 || !bytes.subarray(0, 9).equals(MAGIC))
    throw new Error("invalid_backup");
  const n = bytes.readUInt32BE(9);
  if (n > 1024 || bytes.length < 13 + n + 28) throw new Error("invalid_backup");
  const end = 13 + n + 12,
    prefix = bytes.subarray(0, end),
    iv = bytes.subarray(end - 12, end),
    tag = bytes.subarray(-16);
  const cipher = createDecipheriv("aes-256-gcm", validKey(key), iv);
  cipher.setAAD(prefix);
  cipher.setAuthTag(tag);
  const data = Buffer.concat([
    cipher.update(bytes.subarray(end, -16)),
    cipher.final(),
  ]);
  const metadata = JSON.parse(bytes.subarray(13, 13 + n));
  const created = Date.parse(metadata.created_at),
    expires = Date.parse(metadata.expires_at);
  if (
    metadata.version !== 1 ||
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    expires - created !== RETENTION_MS ||
    created > +now + 60000 ||
    expires <= +now
  )
    throw new Error("expired_or_invalid_backup");
  return { data, metadata };
}
export async function writeArchive(directory, data, key, now = new Date()) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(
    directory,
    `costep-${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.csbk`,
  );
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(seal(data, key, now));
  } catch (e) {
    await handle.close();
    await unlink(file);
    throw e;
  } finally {
    await handle.close();
  }
  return file;
}
export async function prune(directory, key, now = new Date()) {
  let removed = 0,
    invalid = 0;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const name of await readdir(directory)) {
    if (!/^costep-.*\.csbk$/.test(name)) continue;
    const file = path.join(directory, name);
    const s = await lstat(file);
    if (!s.isFile() || s.size > 512 * 1024 * 1024) {
      invalid++;
      continue;
    }
    const bytes = await readFile(file);
    // Authenticate before trusting expiry. Never remove arbitrary or tampered files.
    try {
      const n = bytes.readUInt32BE(9);
      const meta = JSON.parse(bytes.subarray(13, 13 + n));
      const created = Date.parse(meta.created_at);
      if (!Number.isFinite(created)) throw new Error();
      unseal(bytes, key, new Date(created));
      if (created + RETENTION_MS <= +now) {
        await unlink(file);
        removed++;
      }
    } catch {
      invalid++;
    }
  }
  return { removed, invalid };
}
export function loopbackConnection(value) {
  const u = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    !u.pathname.slice(1)
  )
    throw new Error("restore_requires_local_isolated_database");
  return u;
}
