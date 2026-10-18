import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { needsMfa } from "../src/lib/mfa-policy";
import {
  recoveryCodeHash,
  newRecoveryCode,
} from "../src/lib/mfa-recovery-code";
const token = (aal?: string) =>
  `header.${Buffer.from(JSON.stringify({ aal })).toString("base64url")}.signature`;
test("MFA policy fails closed for verified factors without aal2", () => {
  const factors = [{ status: "verified" }];
  assert.equal(needsMfa(token("aal1"), factors), true);
  assert.equal(needsMfa(token("aal2"), factors), false);
  assert.equal(needsMfa(token(), factors), true);
  assert.equal(needsMfa("broken", factors), true);
  assert.equal(needsMfa(token("aal1"), [{ status: "unverified" }]), false);
  assert.equal(needsMfa(token("aal1"), []), false);
});
test("email recovery codes are fixed-width and HMAC-bound to account, request and secret", () => {
  const key = randomBytes(32).toString("base64"),
    { requestId, code } = newRecoveryCode();
  assert.match(code, /^\d{6}$/);
  const hash = recoveryCodeHash("alice", requestId, code, key);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, recoveryCodeHash("bob", requestId, code, key));
  assert.notEqual(
    hash,
    recoveryCodeHash("alice", newRecoveryCode().requestId, code, key),
  );
  assert.notEqual(
    hash,
    recoveryCodeHash(
      "alice",
      requestId,
      code,
      randomBytes(32).toString("base64"),
    ),
  );
});
