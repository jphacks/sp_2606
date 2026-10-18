import { createHash } from "node:crypto";
import { encrypt, decrypt, equal } from "./session-crypto";
const lifetime = 10 * 60_000;
export function issueRecoveryProof(
  userId: string,
  token: string,
  key: string,
  now = Date.now(),
) {
  return encrypt(
    {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      issued: now,
    },
    key,
  );
}
export function verifyRecoveryProof(
  raw: string,
  userId: string,
  token: string,
  key: string,
  now = Date.now(),
) {
  const proof = decrypt<{ userId: string; tokenHash: string; issued: number }>(
    raw,
    key,
  );
  return (
    !!proof &&
    proof.userId === userId &&
    Number.isFinite(proof.issued) &&
    now >= proof.issued &&
    now - proof.issued < lifetime &&
    typeof proof.tokenHash === "string" &&
    equal(proof.tokenHash, createHash("sha256").update(token).digest("hex"))
  );
}
