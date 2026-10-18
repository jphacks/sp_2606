import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { issueRecoveryProof, verifyRecoveryProof } from "../src/lib/recovery-proof";
import { encrypt } from "../src/lib/session-crypto";
test("recovery permission binds account and session, expires and rejects tampering", () => {
  const key = randomBytes(32).toString("base64"), now = 1_000_000;
  const proof = issueRecoveryProof("alice", "session-a", key, now);
  assert.equal(verifyRecoveryProof(proof, "alice", "session-a", key, now), true);
  assert.equal(verifyRecoveryProof(proof, "bob", "session-a", key, now), false);
  assert.equal(verifyRecoveryProof(proof, "alice", "session-b", key, now), false);
  assert.equal(verifyRecoveryProof(proof, "alice", "session-a", key, now + 600_000), false);
  assert.equal(verifyRecoveryProof(proof, "alice", "session-a", key, now - 1), false);
  assert.equal(verifyRecoveryProof("broken", "alice", "session-a", key, now), false);
  assert.equal(verifyRecoveryProof(proof, "alice", "session-a", randomBytes(32).toString("base64"), now), false);
  assert.equal(verifyRecoveryProof(encrypt({ userId: "alice", issued: now }, key), "alice", "session-a", key, now), false);
});
