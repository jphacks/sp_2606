import { validateReport } from "./incident-report.mjs";
const repo = process.env.GITHUB_REPOSITORY;
const run = process.env.GITHUB_RUN_ID;
const token = process.env.GH_TOKEN;
const contact = process.env.SECURITY_CONTACT;
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(contact || ""))
  throw new Error("Missing operator GitHub login");
if (
  !/^[\w.-]+\/[\w.-]+$/.test(repo || "") ||
  !/^\d+$/.test(run || "") ||
  !token
)
  throw new Error("Missing notification context");
const failed = process.env.SCAN_RESULT === "failure";
const report = process.env.SCAN_REPORT
  ? validateReport(JSON.parse(process.env.SCAN_REPORT))
  : null;
if (!failed && (!report || !Object.values(report.counts).some((n) => n > 0)))
  process.exit(0);
const title =
  process.env.SCAN_SOURCE === "public_assets"
    ? "[Security] 公開ファイル検査：運営の対応が必要です"
    : "[Security] 秘密情報検査：運営の対応が必要です";
const url = `https://github.com/${repo}/actions/runs/${run}`;
const body = [
  "秘密情報の候補、または検査処理の失敗を検知しました。自動停止・自動鍵交換はしていません。",
  report
    ? Object.entries(report.counts)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "- 検査結果を取得できませんでした。検査の失敗を確認してください。",
  "分類は暫定です。検出0件でも検査失敗があれば安全とは判断できません。",
  `検査結果：${url}`,
  `対応手順：https://github.com/${repo}/blob/main/docs/INCIDENT_RESPONSE.md`,
  "鍵の値・ソースの断片・非公開情報を、このIssueやコメントへ貼らないでください。",
  "本物の鍵が公開されていた場合は、悪用の証拠を待たず失効・交換します。",
].join("\n\n");
async function api(path, method = "GET", payload) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!res.ok)
    throw new Error(
      `Notification failed (${res.status}); check Actions result and repository permissions`,
    );
  return res.json();
}
let existing;
for (let page = 1; page <= 10; page++) {
  const issues = await api(`/issues?state=open&per_page=100&page=${page}`);
  existing = issues.find(
    (i) =>
      !i.pull_request &&
      i.title === title &&
      i.user?.login === "github-actions[bot]",
  );
  if (existing || issues.length < 100) break;
  if (page === 10) throw new Error("Issue lookup exceeded limit");
}
if (existing) {
  if (!existing.assignees?.some((a) => a.login === contact))
    await api(`/issues/${existing.number}/assignees`, "POST", {
      assignees: [contact],
    });
  await api(`/issues/${existing.number}/comments`, "POST", { body });
} else await api("/issues", "POST", { title, body, assignees: [contact] });
console.log(
  "運営向けの対応Issueを作成／追記しました。GitHubの通知設定で受信を確認してください。",
);
