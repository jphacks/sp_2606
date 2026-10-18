import { createHmac, randomInt, randomUUID } from "node:crypto";
export function newRecoveryCode() {
  return {
    requestId: randomUUID(),
    code: randomInt(0, 1_000_000).toString().padStart(6, "0"),
  };
}
export function recoveryCodeHash(
  userId: string,
  requestId: string,
  code: string,
  secret: string,
) {
  return createHmac("sha256", Buffer.from(secret, "base64"))
    .update(JSON.stringify(["mfa-recovery-v1", userId, requestId, code]))
    .digest("hex");
}
