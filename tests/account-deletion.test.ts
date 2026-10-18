import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeDeletion, deletionInput } from "../src/lib/delete-account";
const input = {
  password: "correct password",
  confirmation: "退会する" as const,
};
test("deletion cannot target a JSON user ID or omit confirmation", () => {
  assert.equal(
    deletionInput.safeParse({ ...input, userId: "victim" }).success,
    false,
  );
  assert.equal(
    deletionInput.safeParse({ password: input.password }).success,
    false,
  );
});
test("deletion requires the same authenticated user and fresh MFA when enabled", async () => {
  const user = {
    id: "owner",
    email: "owner@example.invalid",
    factors: [{ id: "factor", factor_type: "totp", status: "verified" }],
  };
  let factorCalls = 0;
  const verify = async () => {
    factorCalls++;
    return true;
  };
  await assert.rejects(
    authorizeDeletion(
      user,
      { ...input, code: "123456" },
      async () => "other",
      verify,
    ),
  );
  assert.equal(factorCalls, 0);
  await assert.rejects(
    authorizeDeletion(user, input, async () => "owner", verify),
  );
  await assert.rejects(
    authorizeDeletion(
      user,
      { ...input, code: "123456" },
      async () => "owner",
      async () => false,
    ),
  );
  await authorizeDeletion(
    user,
    { ...input, code: "123456" },
    async () => "owner",
    async (id, code) => id === "factor" && code === "123456",
  );
  await authorizeDeletion(
    { ...user, factors: [] },
    input,
    async () => "owner",
    async () => {
      throw new Error("not needed");
    },
  );
});
