import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export function encrypt(value: unknown, key: string): string {
  const bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32) throw new Error("invalid_session_key");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", bytes, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function decrypt<T>(value: string, key: string): T | null {
  try {
    const bytes = Buffer.from(key, "base64"),
      raw = Buffer.from(value, "base64url");
    if (bytes.length !== 32 || raw.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      bytes,
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  } catch {
    return null;
  }
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
