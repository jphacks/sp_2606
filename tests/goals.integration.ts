import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  goalCatalog,
  goalSimilarity,
  type LearningGoal,
} from "../src/lib/goals";
import { recommendationScore, type Profile } from "../src/lib/validation";
test("goal catalog and direct RPC enforce ownership, periods, level types and matching parity", async () => {
  const db = new PGlite();
  const a = "00000000-0000-4000-8000-000000000001",
    b = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const f of [
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
          new URL("../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.exec("update public.profiles set goal='以前の自由記述'");
    const entries = (
      await db.query<{ id: string; label: string; kind: string }>(
        "select id,label,kind from private.goal_catalog order by id",
      )
    ).rows;
    assert.deepEqual(
      entries,
      goalCatalog
        .map(({ id, label, kind }) => ({ id, label, kind }))
        .sort((x, y) => x.id.localeCompare(y.id)),
    );
    const fields = [
      { field: "Python", mode: "level", level: 1, total_minutes: null },
    ];
    const cert: LearningGoal = {
      catalog_id: "cert-ipa-fe",
      start_month: "2026-10",
      target_month: "2027-01",
      target_level: null,
    };
    const tech: LearningGoal = {
      ...cert,
      catalog_id: "tech-python",
      target_level: 2,
    };
    async function as(
      user: string | null,
      sql: string,
      params: unknown[] = [],
    ) {
      await db.exec("reset role;set role " + (user ? "authenticated" : "anon"));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user || "",
      ]);
      return db.query<any>(sql, params);
    }
    const save = (user: string | null, items: unknown) =>
      as(
        user,
        "select public.save_profile_goals('Demo',$1,$2,'',true,'mutual','mutual')",
        [JSON.stringify(fields), JSON.stringify(items)],
      );
    await save(a, [cert, tech]);
    const saved = (await as(a, "select * from public.read_profile($1)", [a]))
      .rows[0];
    assert.deepEqual(saved.goals, [cert, tech]);
    assert.equal(saved.goal, "以前の自由記述");
    const examples = [
      [],
      [cert],
      [{ ...cert, target_month: "2027-05" }],
      [tech],
      [{ ...tech, target_level: 0 }],
      [{ ...tech, target_level: 4 }],
      [{ ...tech, catalog_id: "tech-react" }],
    ];
    for (const goals of examples) {
      await save(b, goals);
      const candidate = (
        await as(a, "select * from public.read_profile($1)", [b])
      ).rows[0];
      await db.exec("reset role");
      const row = (
        await db.query<{ score: number; bonus: number }>(
          "select private.recommendation_score(v,c) score,private.goal_similarity(v.goals,c.goals) bonus from public.profiles v,public.profiles c where v.id=$1 and c.id=$2",
          [a, b],
        )
      ).rows[0];
      assert.ok(
        Math.abs(
          row.score -
            recommendationScore(saved as Profile, candidate as Profile),
        ) < 1e-9,
      );
      assert.ok(
        Math.abs(row.bonus - goalSimilarity(saved.goals, candidate.goals)) <
          1e-9,
      );
    }
    for (const level of [0, 1, 2, 3, 4]) {
      await as(
        a,
        "select public.save_profile_fields('Demo',$1,'以前の自由記述','',true,'mutual','mutual')",
        [
          JSON.stringify([
            { field: "Python", mode: "level", level, total_minutes: null },
          ]),
        ],
      );
      assert.equal(
        (await as(a, "select * from public.read_profile($1)", [a])).rows[0]
          .learning_fields[0].level,
        level,
      );
    }
    await assert.rejects(
      as(
        a,
        "select public.save_profile_fields('Demo',$1,'','',true,'mutual','mutual')",
        [
          JSON.stringify([
            { field: "Python", mode: "level", level: 5, total_minutes: null },
          ]),
        ],
      ),
      /invalid_learning_fields/,
    );
    await assert.rejects(save(null, [cert]));
    for (const invalid of [
      {},
      null,
      [{ ...cert, catalog_id: "unknown" }],
      [{ ...cert, start_month: "2026-13" }],
      [{ ...cert, start_month: "2027-02" }],
      [{ ...tech, target_level: null }],
      [{ ...cert, target_level: 1 }],
      [{ ...tech, target_level: 1.5 }],
      [{ ...tech, target_level: 5 }],
      [{ ...cert, owner_id: b }],
      [cert, cert],
      Array(6).fill(cert),
    ])
      await assert.rejects(save(a, invalid), /invalid_goals/);
    assert.deepEqual(
      (await as(a, "select * from public.read_profile($1)", [a])).rows[0].goals,
      [cert, tech],
    );
    await assert.rejects(
      as(a, "update public.profiles set goals=$1 where id=$2", [
        JSON.stringify([cert]),
        b,
      ]),
    );
    await assert.rejects(as(a, "select * from private.goal_catalog"));
    await assert.rejects(
      as(a, "select private.goal_similarity($1,$1)", [JSON.stringify([cert])]),
    );
    await as(b, "select public.set_block($1,true)", [a]);
    assert.equal(
      (await as(a, "select * from public.read_recommendations()")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
