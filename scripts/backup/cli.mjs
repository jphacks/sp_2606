import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  seal,
  unseal,
  validKey,
  writeArchive,
  prune,
  loopbackConnection,
} from "./archive.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
let command = process.argv[2] || "status";
const env = { ...process.env };
try {
  const config = path.join(root, ".env.backup.local");
  try {
    const info = await stat(config);
    if (info.mode & 0o077) throw new Error("backup_config_must_be_600");
    const { parseEnv } = await import("node:util");
    Object.assign(env, parseEnv(await readFile(config, "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const directory = env.BACKUP_DIRECTORY || path.join(root, ".private-backups");
  if (
    path.resolve(directory).startsWith(path.join(root, "public") + path.sep) ||
    path.resolve(directory) === path.join(root, "public")
  )
    throw new Error("public_backup_directory_forbidden");
  if (command === "init") {
    const keyFile = path.join(root, ".backup-key.local");
    await writeFile(keyFile, randomBytes(32).toString("base64"), {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      config,
      "BACKUP_KEY_FILE=.backup-key.local\nBACKUP_DATABASE_URL=\nRESTORE_DATABASE_URL=\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log("設定ファイルと専用鍵を作成しました。鍵の値は表示しません。");
    process.exit(0);
  }
  let key;
  if (env.BACKUP_KEY_FILE) {
    const keyFile = path.resolve(root, env.BACKUP_KEY_FILE);
    const info = await stat(keyFile);
    if (info.mode & 0o077) throw new Error("backup_key_must_be_600");
    key = (await readFile(keyFile, "utf8")).trim();
    validKey(key);
  }
  if (command === "status") {
    console.log(
      JSON.stringify({
        keyConfigured: !!key,
        databaseConfigured: !!env.BACKUP_DATABASE_URL,
        restoreConfigured: !!env.RESTORE_DATABASE_URL,
        retentionDays: 7,
        scheduled: (() => {
          try {
            execFileSync(
              "launchctl",
              ["print", `gui/${process.getuid()}/local.costep.backup`],
              { stdio: "ignore" },
            );
            return true;
          } catch {
            return false;
          }
        })(),
        productionRestore: false,
      }),
    );
    process.exit(0);
  }
  if (!key) throw new Error("backup_key_not_configured");
  if (command === "prune") {
    console.log(JSON.stringify(await prune(directory, key)));
    process.exit(0);
  }
  if (command === "maintain") {
    const cleanup = await prune(directory, key);
    let latest = 0;
    for (const name of await readdir(directory)) {
      if (!/^costep-.*\.csbk$/.test(name)) continue;
      try {
        const bytes = await readFile(path.join(directory, name));
        const archive = unseal(bytes, key);
        latest = Math.max(latest, Date.parse(archive.metadata.created_at));
        archive.data.fill(0);
      } catch {}
    }
    if (Date.now() - latest < 86400000) {
      console.log(JSON.stringify({ backupNeeded: false, ...cleanup }));
      process.exit(0);
    }
    command = "create";
  }
  const run = async (binary, args, input, connection) => {
    const url = new URL(connection);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("invalid_database_connection");
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.searchParams.get("sslmode") !== "verify-full"
    )
      throw new Error("remote_database_requires_sslmode_verify_full");
    const pgEnv = {
      ...env,
      PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD:
        connection === env.BACKUP_DATABASE_URL && env.BACKUP_DATABASE_PASSWORD
          ? env.BACKUP_DATABASE_PASSWORD
          : decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGSSLMODE: url.searchParams.get("sslmode") || "disable",
      PGCONNECT_TIMEOUT: "15",
      PATH:
        (env.BACKUP_PG_BIN || "/opt/homebrew/opt/libpq/bin") +
        path.delimiter +
        (env.PATH || ""),
    };
    if (env.BACKUP_SSL_ROOT_CERT)
      pgEnv.PGSSLROOTCERT = env.BACKUP_SSL_ROOT_CERT;
    return await new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        env: pgEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const chunks = [];
      let size = 0,
        failed = false;
      const timer = setTimeout(() => {
        failed = true;
        child.kill("SIGTERM");
      }, 300000);
      child.stdout.on("data", (b) => {
        size += b.length;
        if (size > 256 * 1024 * 1024) {
          failed = true;
          child.kill("SIGTERM");
        } else chunks.push(b);
      });
      let diagnostic = "";
      child.stderr.on("data", (b) => {
        if (diagnostic.length < 16384)
          diagnostic += b.toString().slice(0, 16384 - diagnostic.length);
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("postgres_tool_unavailable"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 || failed)
          reject(
            new Error(
              /password authentication failed|no password supplied/i.test(
                diagnostic,
              )
                ? "database_authentication_failed"
                : /certificate|sslrootcert|SSL error/i.test(diagnostic)
                  ? "database_tls_verification_failed"
                  : /could not translate host|Name or service not known|nodename nor servname/i.test(
                        diagnostic,
                      )
                    ? "database_dns_failed"
                    : /connection timed out|Connection refused|Network is unreachable/i.test(
                          diagnostic,
                        )
                      ? "database_connection_unavailable"
                      : /function public.export_account_deletions.*does not exist/i.test(
                            diagnostic,
                          )
                        ? "retention_migration_missing"
                        : /foreign key constraint/i.test(diagnostic)
                          ? "restore_foreign_key_violation"
                          : "postgres_operation_failed",
            ),
          );
        else resolve(Buffer.concat(chunks));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  };
  const currentJournal = async () => {
    if (
      !env.BACKUP_DATABASE_URL ||
      env.BACKUP_DATABASE_URL === env.RESTORE_DATABASE_URL
    )
      throw new Error("fresh_deletion_journal_required");
    const bytes = await run(
      "psql",
      [
        "-X",
        "-tA",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "select public.export_account_deletions()::text;",
      ],
      undefined,
      env.BACKUP_DATABASE_URL,
    );
    const journal = JSON.parse(bytes.toString());
    if (
      !Array.isArray(journal.records) ||
      journal.records.length > 100000 ||
      !Number.isFinite(Date.parse(journal.exported_at)) ||
      Math.abs(Date.now() - Date.parse(journal.exported_at)) > 300000
    )
      throw new Error("fresh_deletion_journal_required");
    for (const row of journal.records)
      if (
        !/^[0-9a-f-]{36}$/.test(row.user_id) ||
        !Number.isFinite(Date.parse(row.deleted_at))
      )
        throw new Error("fresh_deletion_journal_required");
    return journal;
  };
  if (command === "create") {
    if (!env.BACKUP_DATABASE_URL)
      throw new Error("backup_database_not_configured");
    await currentJournal();
    const started = new Date();
    // Custom-format logical dump includes application and authentication data; encrypted before disk write.
    const dump = await run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--schema=public",
        "--schema=private",
        "--schema=auth",
        "--exclude-table-data=private.account_deletions",
        "--exclude-table-data=auth.sessions",
        "--exclude-table-data=auth.refresh_tokens",
        "--exclude-table-data=auth.one_time_tokens",
        "--exclude-table-data=auth.flow_state",
        "--exclude-table-data=auth.mfa_amr_claims",
        "--exclude-table-data=auth.mfa_challenges",
        "--exclude-table-data=auth.saml_relay_states",
        "--exclude-table-data=auth.webauthn_challenges",
      ],
      undefined,
      env.BACKUP_DATABASE_URL,
    );
    if (!dump.subarray(0, 5).equals(Buffer.from("PGDMP")))
      throw new Error("invalid_pg_dump");
    const file = await writeArchive(directory, dump, key, started);
    dump.fill(0);
    const cleanup = await prune(directory, key);
    console.log(
      JSON.stringify({
        created: path.basename(file),
        retentionDays: 7,
        ...cleanup,
      }),
    );
  } else if (command === "restore-test") {
    // This command cannot restore a cloud or production DB. No promotion command exists.
    loopbackConnection(env.RESTORE_DATABASE_URL || "");
    if (
      !/^costep_restore_test_[a-z0-9_]+$/.test(
        new URL(env.RESTORE_DATABASE_URL).pathname.slice(1),
      )
    )
      throw new Error("restore_requires_named_test_database");
    const file = process.argv[3];
    if (!file) throw new Error("backup_file_required");
    if ((await stat(file)).size > 300 * 1024 * 1024)
      throw new Error("backup_too_large");
    await currentJournal();
    const { data } = unseal(await readFile(file), key);
    const check = await run(
      "psql",
      [
        "-X",
        "-tA",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%';",
      ],
      undefined,
      env.RESTORE_DATABASE_URL,
    );
    if (check.toString().trim() !== "0")
      throw new Error("restore_target_not_empty");
    await run(
      "pg_restore",
      [
        "--exit-on-error",
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--dbname=" +
          decodeURIComponent(
            new URL(env.RESTORE_DATABASE_URL).pathname.slice(1),
          ),
      ],
      data,
      env.RESTORE_DATABASE_URL,
    );
    data.fill(0);
    const journal = await currentJournal();
    const sql =
      "begin;" +
      journal.records
        .map(
          (row) =>
            "delete from auth.users where id='" + row.user_id + "'::uuid;",
        )
        .join("") +
      "commit;";
    await run(
      "psql",
      ["-X", "-v", "ON_ERROR_STOP=1"],
      Buffer.from(sql),
      env.RESTORE_DATABASE_URL,
    );
    console.log(
      "隔離DBへの復元処理が完了しました。公開・切替はしていません。権限・削除再適用・Auth整合の確認が別途必要です。",
    );
  } else throw new Error("unknown_command");
} catch (e) {
  const allowed = new Set([
    "backup_config_must_be_600",
    "backup_key_must_be_600",
    "invalid_backup_key",
    "public_backup_directory_forbidden",
    "backup_key_not_configured",
    "backup_database_not_configured",
    "postgres_tool_unavailable",
    "postgres_operation_failed",
    "restore_foreign_key_violation",
    "database_authentication_failed",
    "database_tls_verification_failed",
    "database_dns_failed",
    "database_connection_unavailable",
    "retention_migration_missing",
    "remote_database_requires_sslmode_verify_full",
    "invalid_database_connection",
    "invalid_pg_dump",
    "restore_requires_local_isolated_database",
    "restore_requires_named_test_database",
    "backup_file_required",
    "backup_too_large",
    "restore_target_not_empty",
    "expired_or_invalid_backup",
    "invalid_backup",
    "unknown_command",
    "fresh_deletion_journal_required",
  ]);
  console.error(
    "バックアップ操作を停止しました。" +
      (allowed.has(e.message)
        ? e.message
        : "設定・ファイル・認証情報を確認してください。"),
  );
  process.exitCode = 1;
}
