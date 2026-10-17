import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { recommendationScore, type Profile } from "../src/lib/validation";

test("recommendations rank all 1000 profiles, retain privacy and match scoring", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of [
      "202610170001_foundation.sql",
      "202610170002_conversations.sql",
      "202610170003_follow_approval.sql",
      "202610170004_learning_fields.sql",
      "202610170005_recommendations.sql",
      "202610170006_goals.sql",
      "202610170007_levels.sql",
      "202610170008_level_labels.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await db.exec(`insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,1001) n;
 update public.profiles set display_name='DEMO '||right(id::text,4),created_at='2020-01-01'::timestamptz + right(id::text,12)::integer * interval '1 hour',goal='',learning_fields='[{"field":"AWS","mode":"level","level":3,"total_minutes":null}]';`);
    const fields = [
      { field: "Python", mode: "level", level: 1, total_minutes: null },
    ];
    await db.query(
      "update public.profiles set learning_fields=$1,goal=$2 where id in ($3,$4)",
      [JSON.stringify(fields), "資格取得", id(1), id(2)],
    );
    await db.query(
      "update public.profiles set display_name='最初に登録したPython初級の人' where id=$1",
      [id(2)],
    );
    const all = (await db.query<Profile>("select * from public.profiles")).rows;
    const viewer = all.find((p) => p.id === id(1))!;
    const scored = await db.query<{ id: string; score: number }>(
      "select p.id,private.recommendation_score(v,p) score from public.profiles p cross join public.profiles v where v.id=$1",
      [id(1)],
    );
    for (const row of scored.rows)
      assert.ok(
        Math.abs(
          row.score -
            recommendationScore(
              viewer,
              all.find((p) => p.id === row.id)!,
            ),
        ) < 1e-9,
      );
    // Check time scoring, mixed input modes and best-of-multiple-fields too.
    await db.exec("begin");
    for (const [n, items] of [
      [
        1,
        [
          { field: "Python", mode: "time", level: null, total_minutes: 7200 },
          { ...fields[0], field: "AWS" },
        ],
      ],
      [
        2,
        [{ field: "Python", mode: "time", level: null, total_minutes: 9000 }],
      ],
      [3, [{ field: "Python", mode: "level", level: 2, total_minutes: null }]],
    ] as const)
      await db.query(
        "update public.profiles set learning_fields=$1 where id=$2",
        [JSON.stringify(items), id(n)],
      );
    const samples = (
      await db.query<Profile>(
        "select * from public.profiles where id in ($1,$2,$3)",
        [id(1), id(2), id(3)],
      )
    ).rows;
    const timeViewer = samples.find((p) => p.id === id(1))!;
    const timeScores = await db.query<{ id: string; score: number }>(
      "select p.id,private.recommendation_score(v,p) score from public.profiles p cross join public.profiles v where v.id=$1 and p.id in ($2,$3)",
      [id(1), id(2), id(3)],
    );
    for (const row of timeScores.rows)
      assert.ok(
        Math.abs(
          row.score -
            recommendationScore(
              timeViewer,
              samples.find((p) => p.id === row.id)!,
            ),
        ) < 1e-9,
      );
    await db.exec("rollback");
    async function as(user: string | null, sql: string) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return db.query<Profile>(sql);
    }
    const old = (await as(id(1), "select * from public.read_profiles()")).rows
      .filter((p) => p.id !== id(1))
      .sort(
        (a, b) =>
          recommendationScore(viewer, b) - recommendationScore(viewer, a),
      )
      .slice(0, 12);
    const started = performance.now();
    const result = (
      await as(id(1), "select * from public.read_recommendations()")
    ).rows;
    const ms = performance.now() - started;
    assert.equal(result.length, 12);
    assert.equal(result[0].id, id(2));
    assert.ok(!old.some((p) => p.id === id(2)));
    await assert.rejects(
      as(null, "select * from public.read_recommendations()"),
    );
    for (const restriction of [
      "optout",
      "suspended",
      "blockedByViewer",
      "blockedByCandidate",
    ]) {
      await db.exec("reset role");
      if (restriction === "optout")
        await db.query(
          "update public.profiles set recommend=false where id=$1",
          [id(2)],
        );
      if (restriction === "suspended")
        await db.query(
          "update private.accounts set suspended=true where id=$1",
          [id(2)],
        );
      if (restriction === "blockedByViewer")
        await db.query("insert into private.blocks values($1,$2)", [
          id(1),
          id(2),
        ]);
      if (restriction === "blockedByCandidate")
        await db.query("insert into private.blocks values($1,$2)", [
          id(2),
          id(1),
        ]);
      assert.ok(
        !(
          await as(id(1), "select * from public.read_recommendations()")
        ).rows.some((p) => p.id === id(2)),
        restriction,
      );
      await db.exec(
        "reset role;update public.profiles set recommend=true;update private.accounts set suspended=false;delete from private.blocks;",
      );
    }
    if (process.env.WRITE_DEMO === "1") {
      const cards = (rows: Profile[]) =>
        rows
          .map(
            (p, i) =>
              `<li><strong>${p.display_name}</strong><p>${p.learning_fields![0].field} / ${p.learning_fields![0].level === 1 ? "初級" : "上級"} · ${recommendationScore(viewer, p)}点</p></li>`,
          )
          .join("");
      await writeFile(
        "public/recommendation-demo.html",
        `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CoStep おすすめ比較デモ</title><style>body{font:16px system-ui;background:#f5f7fb;color:#18233d;max-width:1000px;margin:40px auto;padding:20px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}article{background:white;padding:24px;border-radius:16px}li{padding:12px;border-bottom:1px solid #eee}p{line-height:1.7}h1{color:#234ae4}</style><h1>CoStep おすすめ比較デモ</h1><p>架空ユーザー1,000人＋自分。実際のアプリと同じ新しいSQL関数を、ローカルのテスト用DBで実行した結果です。本番の会員・投稿には追加していません。</p><p>自分：Python・初級。相性が最もよい人を古い登録者として配置し、残り999人は新しい登録者（AWS・上級）にしています。</p><section><article><h2>変更前：最新100人から選ぶ</h2><p>相性が最もよい人は候補外。</p><ol>${cards(old)}</ol></article><article><h2>変更後：全対象者から選ぶ</h2><p>古い登録者も点数に応じて表示。</p><ol>${cards(result)}</ol></article></section><p>ブロック（両方向）・利用停止・おすすめ無効・未ログインの除外もテスト済み。これは機能デモであり、本番環境の負荷試験ではありません。</p></html>`,
      );
    }
    console.log(
      `1000-candidate demo verified (${ms.toFixed(0)}ms in local PGlite; not a production benchmark)`,
    );
  } finally {
    await db.close();
  }
});
