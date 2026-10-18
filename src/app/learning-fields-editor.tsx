"use client";
import { useState } from "react";
import { levelDescriptions } from "@/lib/goals";
import { levels, type LearningField } from "@/lib/validation";

import {
  learningFieldKey,
  learningFieldKind,
  learningFieldLabel,
  searchLearningFields,
} from "@/lib/learning-catalog";

export default function LearningFieldsEditor({
  initialFields,
}: {
  initialFields: LearningField[];
}) {
  const [items, setItems] = useState(
    initialFields.map((item) => ({
      field: item.field,
      mode:
        learningFieldKind(item.field) === "certification"
          ? ("time" as const)
          : learningFieldKind(item.field) === "technology"
            ? ("level" as const)
            : item.mode,
      level:
        learningFieldKind(item.field) === "technology" && item.mode === "time"
          ? ""
          : (item.level ?? 0),
      hours: item.mode === "time" ? String(Number((item.total_minutes / 60).toFixed(4))) : "",
    })),
  );
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const results = searchLearningFields(query, kind).filter(
    (option) =>
      !items.some(
        (item) =>
          item.field.toLowerCase() === learningFieldKey(option).toLowerCase(),
      ),
  );
  const values = items.map((item) => ({
    field: item.field,
    mode: item.mode,
    level: item.mode === "level" ? item.level : null,
    total_minutes:
      item.mode === "time" && item.hours !== ""
        ? Math.round(Number(item.hours) * 60)
        : null,
  }));
  function update(field: string, patch: Partial<(typeof items)[number]>) {
    setItems((current) =>
      current.map((item) =>
        item.field === field ? { ...item, ...patch } : item,
      ),
    );
  }
  return (
    <fieldset className="learning-fields-editor">
      <legend>学習分野（複数選択）</legend>
      <input
        type="hidden"
        name="learning_fields"
        value={JSON.stringify(values)}
      />
      <p className="form-note">
        資格・認定や技術を検索して選択できます（最大10件）。分野ごとに現在の経験を設定します。
      </p>
      <div className="catalog-candidates">
        <h3 className="catalog-area-heading">追加する学習分野を探す</h3>
        <p className="catalog-area-note">
          検索候補から「選択する」を押すと、下の選択済みに追加されます。
        </p>
        <div className="goal-search-controls catalog-search-controls">
          <label>
            学習分野の種類
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
            学習分野を検索
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
            <ul className="goal-search-results" aria-label="学習分野の検索結果">
              {results.map((option) => (
                <li key={option.id}>
                  <div>
                    <strong>{option.label}</strong>
                    <small>
                      {option.kind === "certification"
                        ? "資格・認定"
                        : "技術・学習テーマ"}{" "}
                      · {option.category}
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={items.length >= 10}
                    aria-label={`${option.label}を学習分野に追加`}
                    onClick={() =>
                      setItems((current) =>
                        current.some(
                          (item) =>
                            item.field.toLowerCase() ===
                            learningFieldKey(option).toLowerCase(),
                        ) || current.length >= 10
                          ? current
                          : [
                              ...current,
                              {
                                field: learningFieldKey(option),
                                mode:
                                  option.kind === "certification"
                                    ? "time"
                                    : "level",
                                level: 0,
                                hours: "",
                              },
                            ],
                      )
                    }
                  >
                    ＋ 選択する
                  </button>
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p>
                該当する未選択の分野はありません。別名や略称でも検索できます。
              </p>
            )}
          </>
        )}
      </div>
      <div className="catalog-selected">
        <h3 className="catalog-area-heading">
          ✓ 選択済みの学習分野 <span>{items.length}/10件</span>
        </h3>
        <p className="catalog-area-note">
          ここで現在の経験を設定します。最後に「変更を保存する」を押してください。
        </p>
        {items.length === 0 && (
          <p className="form-note">学習分野を1つ以上選んでください。</p>
        )}
        {items.map((item) => (
          <div className="learning-field-row" key={item.field}>
            <span className="catalog-selected-badge">✓ 選択済み</span>
            <div className="section-title">
              <h3>{learningFieldLabel(item.field)}</h3>
              <button
                type="button"
                aria-label={`${learningFieldLabel(item.field)}を学習分野から外す`}
                onClick={() =>
                  setItems((current) =>
                    current.filter((x) => x.field !== item.field),
                  )
                }
              >
                選択解除
              </button>
            </div>
            {learningFieldKind(item.field) === "certification" && (
              <p className="form-note">
                資格・認定は累計学習時間で登録します。
              </p>
            )}
            {item.mode === "level" ? (
              <label>
                習熟度（{learningFieldLabel(item.field)}）
                <span className="level-with-description">
                  <select
                    value={item.level}
                    onChange={(event) =>
                      update(item.field, { level: Number(event.target.value) })
                    }
                  >
                    <option value="" disabled>
                      習熟度を選択
                    </option>
                    {levels.map((level, index) => (
                      <option key={level} value={index}>
                        Lv.{index + 1} {level}
                      </option>
                    ))}
                  </select>
                  <small className="form-note">
                    {item.level === ""
                      ? "累計時間からは換算せず、現在の習熟度を選んでください。"
                      : levelDescriptions[Number(item.level)]}
                  </small>
                </span>
              </label>
            ) : (
              <label>
                累計学習時間（{learningFieldLabel(item.field)}・時間）
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  value={item.hours}
                  onChange={(event) =>
                    update(item.field, { hours: event.target.value })
                  }
                  placeholder="例：120"
                  required
                />
              </label>
            )}
          </div>
        ))}
      </div>
      <p className="form-note">
        習熟度は自己申告です。累計時間には、今後この分野で保存した学習記録の時間が加算され、記録を削除するとその分が戻ります。ここで入力した過去の累計時間自体はグラフには追加しません。分野と経験はプロフィールに公開され、おすすめに使用します。
      </p>
    </fieldset>
  );
}
