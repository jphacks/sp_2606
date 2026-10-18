import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export const kinds = ["supabase", "mail", "session", "other"];
export function classify(findings) {
  if (!Array.isArray(findings)) throw new Error("Invalid scanner report");
  const counts = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const finding of findings) {
    // RuleID is a hint, not proof that a credential is genuine or active.
    const rule =
      typeof finding?.RuleID === "string" ? finding.RuleID.toLowerCase() : "";
    const kind = rule.includes("supabase")
      ? "supabase"
      : /smtp|sendgrid|mailgun|resend|brevo/.test(rule)
        ? "mail"
        : rule === "costep-session-key"
          ? "session"
          : "other";
    counts[kind]++;
  }
  // Never include Secret, Match, File, commit message, or other scanner input.
  return { version: 1, counts };
}
export function validateReport(value) {
  if (
    !value ||
    value.version !== 1 ||
    !value.counts ||
    Object.keys(value).sort().join() !== "counts,version" ||
    Object.keys(value.counts).sort().join() !== [...kinds].sort().join() ||
    !kinds.every(
      (k) =>
        Number.isSafeInteger(value.counts[k]) &&
        value.counts[k] >= 0 &&
        value.counts[k] <= 1000000,
    )
  )
    throw new Error("Invalid sanitized report");
  return value;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = classify(JSON.parse(readFileSync(process.argv[2], "utf8")));
  const found = Object.values(report.counts).some((n) => n > 0);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `found=${found}\nreport=${JSON.stringify(report)}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 秘密情報検査\n${found ? "要対応：秘密情報の候補を検出。種類は暫定分類です。" : "スキャナーの検出なし（漏洩がない保証ではありません）。"}\n\n${kinds.map((k) => `- ${k}: ${report.counts[k]}`).join("\n")}\n\n詳細・鍵の値は公開しません。docs/INCIDENT_RESPONSE.md を参照。\n`,
    );
  console.log(JSON.stringify(report));
}
