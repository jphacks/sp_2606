"use client";

import { useState } from "react";

const years = Array.from({ length: 300 }, (_, i) => String(1900 + i));
const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

export default function MonthPicker({
  label,
  value,
  min = "1900-01",
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const [year, setYear] = useState(value.split("-")[0] || "");
  const [month, setMonth] = useState(value.split("-")[1] || "");

  function change(nextYear: string, nextMonth: string) {
    setYear(nextYear);
    setMonth(nextMonth);
    onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}` : "");
  }

  return (
    <fieldset className="month-picker">
      <legend>{label}</legend>
      <div className="month-picker-controls">
        <label>
          年
          <select
            aria-label={`${label}の年`}
            required
            value={year}
            onChange={(e) => change(e.target.value, month)}
          >
            <option value="">年を選択</option>
            {years.map((y) => (
              <option key={y} value={y} disabled={y < min.slice(0, 4)}>
                {y}年
              </option>
            ))}
          </select>
        </label>
        <label>
          月
          <select
            aria-label={`${label}の月`}
            required
            value={month}
            onChange={(e) => change(year, e.target.value)}
          >
            <option value="">月を選択</option>
            {months.map((m) => (
              <option key={m} value={m} disabled={!!year && `${year}-${m}` < min}>
                {Number(m)}月
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
