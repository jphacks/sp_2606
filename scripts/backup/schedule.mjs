import { mkdir, writeFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const label = "local.costep.backup";
if (process.platform !== "darwin")
  throw new Error(
    "macOS launchd only; configure an equivalent private scheduler.",
  );
const escape = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const args = [
  process.execPath,
  path.join(root, "scripts/backup/cli.mjs"),
  "maintain",
];
const directory = path.join(homedir(), "Library/LaunchAgents");
const file = path.join(directory, label + ".plist");
await mkdir(directory, { recursive: true });
await mkdir(path.join(root, ".private-backups"), {
  recursive: true,
  mode: 0o700,
});
if (
  await stat(file)
    .then(() => true)
    .catch(() => false)
)
  throw new Error("Existing scheduler left unchanged.");
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map((a) => "<string>" + escape(a) + "</string>").join("")}</array><key>WorkingDirectory</key><string>${escape(root)}</string><key>StartInterval</key><integer>3600</integer><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${escape(path.join(root, ".private-backups/maintenance.log"))}</string><key>StandardErrorPath</key><string>${escape(path.join(root, ".private-backups/maintenance-error.log"))}</string><key>ProcessType</key><string>Background</string></dict></plist>`;
await writeFile(file, plist, { flag: "wx", mode: 0o600 });
await writeFile(path.join(root, ".backup-maintenance.plist"), plist, {
  mode: 0o600,
});
execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, file], {
  stdio: "ignore",
});
console.log(
  "Macのログイン中に1時間ごとに期限切れ整理、前回取得から24時間以上なら暗号化バックアップを作成します。停止/スリープ中は実行されません。",
);
