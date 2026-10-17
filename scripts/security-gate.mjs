import fs from "node:fs";
const rows = JSON.parse(
  fs.readFileSync(
    new URL("../security/requirements.json", import.meta.url),
    "utf8",
  ),
).requirements;
const ids = new Set(),
  errors = [];
for (const r of rows) {
  if (ids.has(r.id)) errors.push("duplicate " + r.id);
  ids.add(r.id);
  if (
    r.level === "MUST" &&
    r.status !== "verified" &&
    r.status !== "not_applicable"
  )
    errors.push("unverified " + r.id);
  if (r.status === "verified" && (!r.evidence?.length || !r.tests?.length))
    errors.push("missing evidence " + r.id);
  if (r.status === "not_applicable" && !r.reason)
    errors.push("missing reason " + r.id);
}
if (errors.length) {
  console.error(
    "実ユーザー公開ゲートは未達です。" +
      errors.length +
      "項目を確認してください。",
  );
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Recorded requirements pass; human release review still required.");
