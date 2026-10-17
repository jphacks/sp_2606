import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, equal } from "../src/lib/session-crypto";
import {
  signupSchema,
  profileSchema,
  studySchema,
  postSchema,
  recommendationScore,
  learningFieldsSchema,
  profileSummary,
  type Profile,
} from "../src/lib/validation";
test("sealed tokens cannot be read or tampered with; wrong keys fail closed", () => {
  const key = randomBytes(32).toString("base64"),
    other = randomBytes(32).toString("base64"),
    payload = { access_token: "sensitive-value", user_id: "A" };
  const value = encrypt(payload, key);
  assert(!value.includes(payload.access_token));
  assert.deepEqual(decrypt(value, key), payload);
  assert.equal(decrypt(value, other), null);
  const raw = Buffer.from(value, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal(decrypt(raw.toString("base64url"), key), null);
  assert.equal(decrypt("malformed", key), null);
});
test("CSRF equality handles mismatched lengths safely", () => {
  assert(equal("same", "same"));
  assert(!equal("same", "other"));
  assert(!equal("same", ""));
});
test("registration accepts credentials only; visibility is chosen during profile setup", () => {
  const base = {
    email: "a@example.com",
    password: "123456789012",
  };
  assert(signupSchema.safeParse(base).success);
  assert(!signupSchema.safeParse({ ...base, visibility: "public" }).success);
  assert(!signupSchema.safeParse({ ...base, is_admin: true }).success);
  assert(!signupSchema.safeParse({ ...base, password: "short" }).success);
});
test("profile cannot accept administrative or ownership fields", () => {
  const base = {
    display_name: "A",
    learning_fields: [
      { field: "Python", mode: "level", level: 0, total_minutes: null },
    ],
    goal: "",
    bio: "",
    recommend: true,
    visibility: "mutual",
    dm_policy: "mutual",
  };
  assert(profileSchema.safeParse(base).success);
  assert(!profileSchema.safeParse({ ...base, id: "other" }).success);
  assert(!profileSchema.safeParse({ ...base, role: "admin" }).success);
  assert(
    !profileSchema.safeParse({
      ...base,
      learning_fields: [
        { field: "Python", mode: "level", level: 4, total_minutes: null },
      ],
    }).success,
  );
});
test("study is separate from text and images, with finite duration and idempotency key", () => {
  const base = {
    field: "Python",
    date: "2026-10-17",
    minutes: 30,
    request_id: "12345678-1234-4234-8234-123456789abc",
  };
  assert(studySchema.safeParse(base).success);
  for (const minutes of [-1, 0, 1441, NaN, Infinity])
    assert(!studySchema.safeParse({ ...base, minutes }).success);
  assert(!studySchema.safeParse({ ...base, image: "anything" }).success);
  assert(!studySchema.safeParse({ ...base, body: "private note" }).success);
  assert(!studySchema.safeParse({ ...base, date: "2026-02-30" }).success);
});
test("post requires nonblank text and rejects extra owner fields", () => {
  assert(!postSchema.safeParse({ body: "  " }).success);
  assert(!postSchema.safeParse({ body: "hello", owner_id: "other" }).success);
  assert(!postSchema.safeParse({ body: "x".repeat(2001) }).success);
});
test("recommendations depend only on declared public fields", () => {
  const a = { field: "Python", level: 0, goal: "試験" } as Profile,
    b = { field: "Python", level: 0, goal: "試験" } as Profile,
    c = { field: "AWS", level: 3, goal: "" } as Profile;
  assert(recommendationScore(a, b) > recommendationScore(a, c));
});

test("multiple fields validate one experience type per field and reject duplicates/invalid time", () => {
  const a = { field: "Python", mode: "level", level: 1, total_minutes: null };
  const b = { field: "AWS", mode: "time", level: null, total_minutes: 7200 };
  assert(learningFieldsSchema.safeParse([a, b]).success);
  for (const items of [
    [],
    [a, a],
    [a, { ...a, field: "python" }],
    [{ ...a, total_minutes: 100 }],
    [{ ...b, level: 1 }],
    [{ ...b, total_minutes: -1 }],
    [{ ...b, total_minutes: 0.5 }],
    [{ ...b, total_minutes: 6000001 }],
    [{ ...b, total_minutes: Infinity }],
    [{ ...b, owner_id: "other" }],
  ])
    assert(!learningFieldsSchema.safeParse(items).success);
  const viewer = {
    field: "Python",
    level: 0,
    goal: "",
    learning_fields: [a, b],
  } as Profile;
  const close = {
    ...viewer,
    learning_fields: [{ ...b, total_minutes: 7260 }],
  } as Profile;
  const distant = {
    ...viewer,
    learning_fields: [{ ...b, total_minutes: 60000 }],
  } as Profile;
  assert(
    recommendationScore(viewer, close) > recommendationScore(viewer, distant),
  );
  assert(profileSummary(viewer).includes("AWS · 累計120時間"));
  assert(!profileSummary(close).includes("未経験"));
});
