import { readFileSync } from "node:fs";
const repo = process.env.GITHUB_REPOSITORY,
  run = process.env.GITHUB_RUN_ID,
  token = process.env.GH_TOKEN;
if (repo !== "jphacks/sp_2606" || !/^\d+$/.test(run || "") || !token)
  throw new Error("Invalid notification context");
const allowed = [
  "login_rejections",
  "mfa_rejections",
  "password_email_volume",
  "mfa_recovery_volume",
  "server_errors",
  "monitor_unavailable",
];
const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (
  input.version !== 1 ||
  input.window_minutes !== 30 ||
  !Array.isArray(input.alerts) ||
  input.alerts.length > 6 ||
  !input.alerts.every((a) => allowed.includes(a))
)
  throw new Error("Invalid report");
if (!input.alerts.length) process.exit(0);
const title = "[Security] 公開サイト・認証監視：確認が必要です";
const labels = {
  login_rejections: "ログイン拒否の急増",
  mfa_rejections: "二要素認証の拒否増加",
  password_email_volume: "パスワード再設定の要求増加",
  mfa_recovery_volume: "二要素認証の復旧要求増加",
  server_errors: "認証処理のエラー増加",
  monitor_unavailable: "監視が取得不能（安全と判定できません）",
};
const body = `直近30分の監視で確認事項があります。これは漏洩の確定ではありません。自動停止・鍵交換はしていません。\n\n${input.alerts.map((a) => "- " + labels[a]).join("\n")}\n\nhttps://github.com/${repo}/actions/runs/${run}\n\n対応：docs/INCIDENT_RESPONSE.md。秘密・個人情報をIssueへ貼らないでください。`;
async function api(path, method = "GET", data) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!r.ok) throw new Error(`Notification failed (${r.status})`);
  return r.json();
}
const issues = await api("/issues?state=open&per_page=100");
const existing = issues.find(
  (i) =>
    !i.pull_request &&
    i.title === title &&
    i.user?.login === "github-actions[bot]",
);
if (existing) {
  // Avoid notifying every 15 minutes about the same ongoing condition.
  const comments = await api(
    `/issues/${existing.number}/comments?per_page=1&page=${Math.max(1, Number(existing.comments) || 1)}`,
  );
  const last = comments.at(-1);
  if (
    Date.now() - Date.parse(last?.created_at || existing.created_at) <
    3600000
  )
    process.exit(0);
  await api(`/issues/${existing.number}/comments`, "POST", { body });
} else await api("/issues", "POST", { title, body, assignees: ["ryo7-7"] });
console.log("Operator issue notified (no personal data).");
