import { test } from "node:test";
import assert from "node:assert/strict";
import { goalCatalog } from "../src/lib/goals";
import {
  learningFieldKey,
  learningFieldLabel,
  searchLearningFields,
} from "../src/lib/learning-catalog";
import { learningFieldsSchema, profileSummary } from "../src/lib/validation";
test("learning catalog preserves legacy matching keys and stores long certification names safely", () => {
  const keys = goalCatalog.map(learningFieldKey);
  assert.equal(new Set(keys).size, goalCatalog.length);
  assert.ok(keys.every((key) => key.length > 0 && key.length <= 30));
  assert.equal(
    learningFieldKey(goalCatalog.find((item) => item.id === "cert-ipa-fe")!),
    "基本情報",
  );
  assert.equal(
    learningFieldKey(goalCatalog.find((item) => item.id === "cert-ipa-ap")!),
    "応用情報",
  );
  assert.equal(
    learningFieldKey(goalCatalog.find((item) => item.id === "tech-python")!),
    "Python",
  );
  assert.equal(searchLearningFields("FE")[0].id, "cert-ipa-fe");
  assert.equal(searchLearningFields("Python")[0].id, "tech-python");
  const item = goalCatalog.find((item) => item.id === "cert-aws-saa")!;
  assert.equal(learningFieldLabel(learningFieldKey(item)), item.label);
  const field = {
    field: learningFieldKey(item),
    mode: "time" as const,
    level: null,
    total_minutes: 7200,
  };
  assert.ok(learningFieldsSchema.safeParse([field]).success);
  assert.ok(
    profileSummary({ learning_fields: [field] } as any).includes(item.label),
  );
  assert.equal(learningFieldLabel("既存の独自分野"), "既存の独自分野");
});
