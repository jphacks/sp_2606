"use client";
import { useState } from "react";
import MonthPicker from "./month-picker";
import {
  goalCatalogById,
  searchGoals,
  targetLevels,
  levelDescriptions,
  goalMonths,
  type LearningGoal,
} from "@/lib/goals";
export default function GoalsEditor({
  initialGoals,
}: {
  initialGoals: LearningGoal[];
}) {
  const [items, setItems] = useState(initialGoals);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const results = searchGoals(query, kind).filter(
    (item) => !items.some((g) => g.catalog_id === item.id),
  );
  function update(id: string, patch: Partial<LearningGoal>) {
    setItems((current) =>
      current.map((g) => (g.catalog_id === id ? { ...g, ...patch } : g)),
    );
  }
  return (
    <fieldset className="goals-editor">
      <legend>目標</legend>
      <input type="hidden" name="goals" value={JSON.stringify(items)} />
      <p className="form-note">
        資格・認定や技術を検索して選択できます（最大5件）。目標と期間はプロフィールに公開され、おすすめに使用します。
      </p>
      <div className="catalog-candidates">
        <h3 className="catalog-area-heading">追加する目標を探す</h3>
        <p className="catalog-area-note">
          検索候補から「選択する」を押すと、下の選択済みに追加されます。
        </p>
        <div className="goal-search-controls catalog-search-controls">
          <label>
            種類
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
              }}
            >
              <option value="all">すべて</option>
              <option value="certification">資格・認定</option>
              <option value="technology">技術・学習テーマ</option>
            </select>
          </label>
          <label>
            目標を検索
            <input
              type="search"
              value={query}
              maxLength={100}
              placeholder="例：基本情報、FE、Python、AWS"
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </label>
        </div>
        {!query.trim() && (
          <p className="form-note">1文字以上入力すると候補を表示します。</p>
        )}
        {query.trim() && (
          <p className="form-note" aria-live="polite">
            未選択の候補 {results.length}件
          </p>
        )}
        {query.trim() && (
          <>
            <ul className="goal-search-results" aria-label="目標の検索結果">
              {results.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.kind === "certification"
                        ? "資格・認定"
                        : "技術・学習テーマ"}{" "}
                      · {item.category}
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={items.length >= 5}
                    aria-label={`${item.label}を目標に追加`}
                    onClick={() => {
                      setItems((current) => [
                        ...current,
                        {
                          catalog_id: item.id,
                          start_month: "",
                          target_month: "",
                          target_level: item.kind === "technology" ? 0 : null,
                        },
                      ]);
                    }}
                  >
                    ＋ 選択する
                  </button>
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p>該当する項目がありません。別名や略称でも検索できます。</p>
            )}
          </>
        )}
      </div>
      <div className="selected-goals catalog-selected">
        <h3 className="catalog-area-heading">
          ✓ 選択済みの目標 <span>{items.length}/5件</span>
        </h3>
        <p className="catalog-area-note">
          ここで目指すレベルと期間を設定します。最後に「変更を保存する」を押してください。
        </p>
        {items.length === 0 && (
          <p className="form-note">まだ選択していません。</p>
        )}
        {items.map((goal) => {
          const item = goalCatalogById.get(goal.catalog_id);
          const validPeriod =
            /^\d{4}-\d{2}$/.test(goal.start_month) &&
            /^\d{4}-\d{2}$/.test(goal.target_month) &&
            goal.start_month <= goal.target_month;
          return (
            <section className="selected-goal" key={goal.catalog_id}>
              <span className="catalog-selected-badge">✓ 選択済み</span>
              <div className="section-title">
                <h3>{item?.label || "登録済みの目標"}</h3>
                <button
                  type="button"
                  aria-label={`${item?.label}を目標から外す`}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((g) => g.catalog_id !== goal.catalog_id),
                    )
                  }
                >
                  選択解除
                </button>
              </div>
              {item?.kind === "technology" && (
                <label>
                  目指すレベル（{item.label}）
                  <span className="level-with-description">
                    <select
                      value={goal.target_level ?? 0}
                      onChange={(e) =>
                        update(goal.catalog_id, {
                          target_level: Number(e.target.value),
                        })
                      }
                    >
                      {targetLevels.map((text, i) => (
                        <option key={text} value={i}>
                          Lv.{i + 1} {text}
                        </option>
                      ))}
                    </select>
                    <small className="form-note">
                      {levelDescriptions[goal.target_level ?? 0]}
                    </small>
                  </span>
                </label>
              )}
              <div className="goal-search-controls">
                <MonthPicker
                  label={`開始月（${item?.label}）`}
                  value={goal.start_month}
                  onChange={(value) =>
                    update(goal.catalog_id, { start_month: value })
                  }
                />
                <MonthPicker
                  label={`達成目標月（${item?.label}）`}
                  value={goal.target_month}
                  min={goal.start_month || "1900-01"}
                  onChange={(value) =>
                    update(goal.catalog_id, { target_month: value })
                  }
                />
              </div>
              {validPeriod ? (
                <p>学習期間：{goalMonths(goal)}か月（開始月・目標月を含む）</p>
              ) : (
                <p className="form-note">
                  開始月と、その月以降の達成目標月を設定してください。
                </p>
              )}
              <a href={item?.source_url} target="_blank" rel="noreferrer">
                {item?.kind === "certification"
                  ? "資格・認定の公式情報"
                  : "学習テーマの参考情報"}
              </a>
            </section>
          );
        })}
      </div>
      {items.some(
        (g) => goalCatalogById.get(g.catalog_id)?.kind === "technology",
      ) && (
        <p className="form-note">
          目指すレベルはCoStep内の自己申告の目安です。現在の習熟度とは別に設定します。
        </p>
      )}
    </fieldset>
  );
}
