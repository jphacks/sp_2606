import { test } from "node:test";
import assert from "node:assert/strict";
import {
  goalsSchema,
  goalMonths,
  goalSimilarity,
  searchGoals,
  goalCatalog,
  goalLabel,
  type LearningGoal,
} from "../src/lib/goals";
const certification: LearningGoal = {
  catalog_id: "cert-ipa-fe",
  start_month: "2026-10",
  target_month: "2027-01",
  target_level: null,
};
const technology: LearningGoal = {
  ...certification,
  catalog_id: "tech-python",
  target_level: 2,
};
test("catalog aliases, monthly periods and goal scoring use structured data", () => {
  assert.ok(goalCatalog.length >= 200);
  assert.equal(new Set(goalCatalog.map((x) => x.id)).size, goalCatalog.length);
  assert.ok(
    goalCatalog.every(
      (x) =>
        x.source_url.startsWith("https://") && x.verified_on === "2026-10-17",
    ),
  );
  for (const q of ["基本情報", "ＦＥ", "FE"])
    assert.ok(
      searchGoals(q, "certification").some((x) => x.id === "cert-ipa-fe"),
    );
  assert.ok(
    searchGoals("ぱいそん", "technology").some((x) => x.id === "tech-python"),
  );
  assert.ok(searchGoals("AWS SAA").some((x) => x.id === "cert-aws-saa"));
  assert.equal(goalMonths(certification), 4);
  assert.equal(goalMonths({ ...certification, start_month: "2027-01" }), 1);
  assert.equal(goalSimilarity([certification], [certification]), 30);
  assert.equal(goalSimilarity([technology], [technology]), 40);
  assert.equal(
    goalSimilarity(
      [certification],
      [{ ...certification, target_month: "2027-05" }],
    ),
    25,
  );
  assert.equal(
    goalSimilarity([technology], [{ ...technology, target_level: 3 }]),
    37.5,
  );
  assert.equal(goalSimilarity([certification], [technology]), 0);
  assert.equal(
    goalSimilarity([certification, technology], [certification, technology]),
    40,
  );
  for (const invalid of [
    [{ ...technology, target_level: null }],
    [{ ...certification, target_level: 1 }],
    [{ ...certification, catalog_id: "fake" }],
    [{ ...certification, start_month: "2027-02" }],
    [{ ...certification, start_month: "2026-13" }],
    [{ ...certification, target_month: "2027-00" }],
    [{ ...certification, start_month: "2026-10-01" }],
    [{ ...technology, target_level: 1.5 }],
    [{ ...technology, target_level: 5 }],
    [{ ...certification, owner_id: "other" }],
    [certification, certification],
    Array.from({ length: 6 }, (_, i) => ({
      ...certification,
      catalog_id: goalCatalog[i].id,
    })),
  ])
    assert.equal(
      goalsSchema.safeParse(invalid).success,
      false,
      JSON.stringify(invalid),
    );
  assert.ok(goalsSchema.safeParse([]).success);
  assert.ok(goalsSchema.safeParse([certification, technology]).success);
  const entry = { ...technology, target_level: 0 };
  assert.ok(goalsSchema.safeParse([entry]).success);
  assert.ok(goalLabel(entry).includes("興味・入門"));
  assert.equal(goalSimilarity([entry], [{ ...entry, target_level: 4 }]), 30);
});
