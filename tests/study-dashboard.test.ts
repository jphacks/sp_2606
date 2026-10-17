import { test } from "node:test";
import assert from "node:assert/strict";
import { monthCells, weekStart, shiftDay, heatLevel, studySummary } from "../src/lib/study-dashboard";
test("study calendar covers leap months, Monday weeks and adjacent-month comparisons", () => {
  assert.equal(monthCells("2024-02").filter((d) => d.startsWith("2024-02")).length, 29);
  assert.equal(monthCells("2026-02").length, 35);
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
  assert.equal(shiftDay("2027-01-01", -1), "2026-12-31");
  const rows = [{ study_date: "2026-10-31", field: "Python", minutes: 45 }, { study_date: "2026-11-01", field: "Python", minutes: 30 }, { study_date: "2026-11-01", field: "AWS", minutes: 60 }];
  const summary = studySummary(rows, "2026-10-26", "2026-11-01");
  assert.equal(summary.total, 135);
  assert.equal(summary.days["2026-11-01"], 90);
  assert.deepEqual(summary.fields, [["Python",75],["AWS",60]]);
  assert.deepEqual([0,1,29,30,59,60,119,120,239,240].map(heatLevel), [0,1,1,2,2,3,3,4,4,5]);
});
