import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldExperience } from "../src/lib/validation";
test("cumulative display rounds at 30 minutes without changing stored minutes", () => {
  for (const [minutes, hours] of [[0,0],[29,0],[30,1],[60,1],[89,1],[90,2],[629,10],[630,11]]) {
    const field = { field: "基本情報", mode: "time" as const, level: null, total_minutes: minutes };
    assert.equal(fieldExperience(field), `累計${hours}時間`);
    assert.equal(field.total_minutes, minutes);
  }
});
