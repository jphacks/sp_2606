"use client";
import { useState } from "react";
import { fieldOptions, levels, type LearningField } from "@/lib/validation";

export default function LearningFieldsEditor({
  initialFields,
}: {
  initialFields: LearningField[];
}) {
  const [items, setItems] = useState(
    initialFields.map((item) => ({
      field: item.field,
      mode: item.mode,
      level: item.level ?? 0,
      hours: item.mode === "time" ? String(item.total_minutes / 60) : "",
    })),
  );
  const options = [
    ...new Set([...fieldOptions, ...initialFields.map((x) => x.field)]),
  ];
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
      <div className="field-options">
        {options.map((field) => (
          <label className="check-label" key={field}>
            <input
              type="checkbox"
              checked={items.some((item) => item.field === field)}
              onChange={(event) =>
                setItems((current) =>
                  event.target.checked
                    ? [
                        ...current,
                        { field, mode: "level", level: 0, hours: "" },
                      ]
                    : current.filter((item) => item.field !== field),
                )
              }
            />
            {field}
          </label>
        ))}
      </div>
      {items.length === 0 && (
        <p className="form-note">学習分野を1つ以上選んでください。</p>
      )}
      {items.map((item) => (
        <div className="learning-field-row" key={item.field}>
          <h3>{item.field}</h3>
          <label>
            経験の入力方法（{item.field}）
            <select
              value={item.mode}
              onChange={(event) =>
                update(item.field, {
                  mode: event.target.value as "level" | "time",
                })
              }
            >
              <option value="level">習熟度で入力</option>
              <option value="time">累計学習時間で入力</option>
            </select>
          </label>
          {item.mode === "level" ? (
            <label>
              習熟度（{item.field}）
              <select
                value={item.level}
                onChange={(event) =>
                  update(item.field, { level: Number(event.target.value) })
                }
              >
                {levels.map((level, index) => (
                  <option key={level} value={index}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              累計学習時間（{item.field}・時間）
              <input
                type="number"
                min="0"
                max="100000"
                step="0.5"
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
      <p className="form-note">
        経験は自己申告です。累計学習時間は日々の記録やグラフには加算しません。選んだ分野と経験はプロフィールに公開され、おすすめに使用します。
      </p>
    </fieldset>
  );
}
