"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  FilePenLine,
} from "lucide-react";
import { learningFieldLabel } from "@/lib/learning-catalog";
import {
  duration,
  heatLevel,
  monthCells,
  shiftDay,
  studySummary,
  studyFieldColor,
  weekStart,
  type DailyStudy,
} from "@/lib/study-dashboard";
import type { Study } from "@/lib/validation";

type Dashboard = {
  daily: DailyStudy[];
  records: (Study & { memo?: string | null })[];
  records_truncated: boolean;
};
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const today = () => new Date().toLocaleDateString("sv-SE");
export default function StudyDashboard({
  owner,
  userId,
  name,
  refreshKey,
  onAdd,
  onDelete,
}: {
  owner: string;
  userId: string;
  name: string;
  refreshKey: Study[];
  onAdd: (day: string) => void;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void fetch(
      `/api/study-dashboard?owner=${encodeURIComponent(owner)}&month=${month}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [owner, month, refreshKey]);
  const rows = data?.daily || [];
  const cells = monthCells(month);
  const calendar = studySummary(rows, cells[0], cells[cells.length - 1]);
  const start = weekStart(selected),
    end = shiftDay(start, 6);
  const week = studySummary(rows, start, end);
  const previous = studySummary(rows, shiftDay(start, -7), shiftDay(start, -1));
  const monthEnd = cells.filter((d) => d.startsWith(month)).at(-1)!;
  const breakdown =
    period === "week" ? week : studySummary(rows, month + "-01", monthEnd);
  const diff = week.total - previous.total;
  const categories = breakdown.fields.map(([field, minutes]) => ({
    field,
    minutes,
    color: studyFieldColor(field),
  }));
  let offset = 0;
  const gradient = categories
    .map((c) => {
      const from = offset;
      offset += (c.minutes / breakdown.total) * 100;
      return `${c.color} ${from}% ${offset}%`;
    })
    .join(", ");
  const selectedRecords = (data?.records || []).filter(
    (r) => r.study_date === selected,
  );
  const own = owner === userId;
  function scrollToSection(element: HTMLElement | null) {
    element?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function selectDay(day: string) {
    setSelected(day);
    setMonth(day.slice(0, 7));
  }
  function moveMonth(delta: number) {
    const date = new Date(month + "-01T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0, 7);
    if (next < "1900-01" || next > "2199-12") return;
    setMonth(next);
    setSelected(next === today().slice(0, 7) ? today() : next + "-01");
  }
  const selectedLabel = new Date(selected + "T00:00:00Z").toLocaleDateString(
    "ja-JP",
    { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" },
  );
  return (
    <section
      className="study-dashboard"
      aria-label="学習記録ダッシュボード"
      aria-busy={loading}
    >
      <div className="sd-heading">
        <div>
          {!own && <h2>{name}さんの学習記録</h2>}
          <span className="sd-visibility">
            学習分野・日付・時間はログイン済み全員に公開
          </span>
        </div>
        <div className="sd-view-actions">
          <button
            aria-label="週間グラフへ移動"
            onClick={() => scrollToSection(chartRef.current)}
          >
            <BarChart3 size={20} aria-hidden="true" />
            <span>グラフ</span>
          </button>
          <button
            aria-label="カレンダーへ移動"
            onClick={() => scrollToSection(calendarRef.current)}
          >
            <CalendarDays size={20} aria-hidden="true" />
            <span>カレンダー</span>
          </button>
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="sd-loading">
          学習記録を読み込み中…
        </p>
      )}
      {!loading && data && (
        <>
          <div className="sd-card sd-calendar-card" ref={calendarRef}>
            <div className="sd-calendar-main">
              <div className="sd-month-nav">
                <button
                  aria-label="前の月"
                  disabled={month === "1900-01"}
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft size={22} />
                </button>
                <h3>
                  {Number(month.slice(0, 4))}年{Number(month.slice(5))}月
                </h3>
                <button
                  aria-label="次の月"
                  disabled={month === "2199-12"}
                  onClick={() => moveMonth(1)}
                >
                  <ChevronRight size={22} />
                </button>
              </div>
              <div
                className="sd-calendar-grid"
                role="group"
                aria-label={`${month}の学習カレンダー`}
              >
                {weekdays.map((d) => (
                  <span className="sd-weekday" key={d}>
                    {d}
                  </span>
                ))}
                {cells.map((day) => {
                  const minutes = calendar.days[day] || 0;
                  return (
                    <button
                      key={day}
                      disabled={day < "1900-01-01" || day > "2199-12-31"}
                      className={`sd-day sd-heat-${heatLevel(minutes)}${day.startsWith(month) ? "" : " sd-outside"}${day === selected ? " sd-selected" : ""}${day === today() ? " sd-today" : ""}`}
                      aria-label={`${day} ${duration(minutes)}`}
                      aria-pressed={day === selected}
                      onClick={() => selectDay(day)}
                    >
                      {Number(day.slice(8))}
                    </button>
                  );
                })}
              </div>
            </div>
            <aside className="sd-calendar-legend">
              <h4>学習した日</h4>
              {[
                "4時間以上",
                "2〜4時間未満",
                "1〜2時間未満",
                "30分〜1時間未満",
                "30分未満",
                "未学習",
              ].map((label, i) => (
                <div key={label}>
                  <span className={`sd-legend-dot sd-heat-${5 - i}`} />
                  {label}
                </div>
              ))}
              <button
                className="sd-today-button"
                onClick={() => selectDay(today())}
              >
                今日に戻る
              </button>
            </aside>
          </div>
          <div className="sd-chart-grid" ref={chartRef}>
            <div className="sd-card sd-week-card">
              <div className="sd-card-heading">
                <h3>
                  {start === weekStart(today())
                    ? "今週の学習時間"
                    : "選択週の学習時間"}
                </h3>
              </div>
              <p className="sd-range">
                {start.slice(5).replace("-", "/")} —{" "}
                {end.slice(5).replace("-", "/")}
              </p>
              <div className="sd-big-duration">
                <strong>{Math.floor(week.total / 60)}</strong>
                <span>時間</span>
                <strong>{week.total % 60}</strong>
                <span>分</span>
              </div>
              <p className="sd-comparison">
                前週比{" "}
                <span className={diff > 0 ? "sd-positive" : ""}>
                  {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                  {duration(Math.abs(diff))}
                </span>
              </p>
              <div
                className="sd-bar-chart"
                role="group"
                aria-label={`週間学習時間。${weekdays.map((d, i) => `${d}曜${duration(week.days[shiftDay(start, i)] || 0)}`).join("、")}`}
              >
                {weekdays.map((label, i) => {
                  const date = shiftDay(start, i),
                    minutes = week.days[date] || 0;
                  const segments = studySummary(rows, date, date).fields;
                  return (
                    <button
                      className={`sd-bar-col${date === selected ? " sd-bar-selected" : ""}`}
                      key={date}
                      onClick={() => selectDay(date)}
                      aria-label={`${date} 合計${duration(minutes)}。${segments.map(([field, time]) => `${learningFieldLabel(field)} ${duration(time)}`).join("、")}の記録を見る`}
                    >
                      <span className="sd-bar-value">
                        {minutes ? `${Math.round(minutes / 6) / 10}h` : "0"}
                      </span>
                      <span className="sd-bar-track">
                        <span
                          className="sd-bar-stack"
                          style={{
                            height: `${minutes ? Math.max(3, (minutes / Math.max(60, ...Object.values(week.days))) * 100) : 0}%`,
                          }}
                        >
                          {segments.map(([field, time]) => (
                            <span
                              key={field}
                              className="sd-bar-segment"
                              title={`${learningFieldLabel(field)}：${duration(time)}`}
                              style={{
                                height: `${(time / minutes) * 100}%`,
                                background: studyFieldColor(field),
                              }}
                            />
                          ))}
                        </span>
                      </span>
                      <span className="sd-bar-label">{label}</span>
                    </button>
                  );
                })}
              </div>
              <ul className="sd-week-legend" aria-label="週間グラフの色分け">
                {week.fields.map(([field]) => (
                  <li key={field}>
                    <span style={{ background: studyFieldColor(field) }} />
                    {learningFieldLabel(field)}
                  </li>
                ))}
              </ul>
              <details className="sd-week-details">
                <summary>日別・分野別の時間</summary>
                <div className="sd-table-scroll">
                  <table>
                    <caption className="sr-only">
                      選択週の学習時間の内訳
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">日付</th>
                        <th scope="col">学習分野</th>
                        <th scope="col">時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .filter(
                          (r) => r.study_date >= start && r.study_date <= end,
                        )
                        .map((r) => (
                          <tr key={`${r.study_date}-${r.field}`}>
                            <th scope="row">
                              {Number(r.study_date.slice(5, 7))}月
                              {Number(r.study_date.slice(8))}日
                            </th>
                            <td>{learningFieldLabel(r.field)}</td>
                            <td>{duration(r.minutes)}</td>
                          </tr>
                        ))}
                      {!week.total && (
                        <tr>
                          <td colSpan={3}>この週の記録はありません。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
            <div className="sd-card sd-category-card">
              <div className="sd-card-heading">
                <h3>学習分野の内訳</h3>
                <select
                  aria-label="内訳の集計期間"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="week">選択週</option>
                  <option value="month">選択月</option>
                </select>
              </div>
              <div className="sd-category-content">
                <div
                  className="sd-donut"
                  role="img"
                  aria-label={`合計${duration(breakdown.total)}。${categories.map((c) => `${learningFieldLabel(c.field)} ${duration(c.minutes)}`).join("、")}`}
                  style={{
                    background: gradient
                      ? `conic-gradient(${gradient})`
                      : "#edf2f3",
                  }}
                >
                  <div className="sd-donut-hole">
                    <span>合計</span>
                    <strong>{Math.floor(breakdown.total / 60)}時間</strong>
                    <small>{breakdown.total % 60}分</small>
                  </div>
                </div>
                <ul className="sd-category-legend">
                  {categories.map((c) => (
                    <li key={c.field}>
                      <span style={{ background: c.color }} />
                      <div>
                        <strong>{learningFieldLabel(c.field)}</strong>
                        <small>
                          {duration(c.minutes)}
                          <br />(
                          {Math.round((c.minutes / breakdown.total) * 100)}%)
                        </small>
                      </div>
                    </li>
                  ))}
                  {!categories.length && <li>この期間の記録はありません。</li>}
                </ul>
              </div>
            </div>
          </div>
          <div className="sd-card sd-records">
            <div className="sd-card-heading">
              <h3>{selectedLabel}の学習記録</h3>
              <span>{duration(calendar.days[selected] || 0)}</span>
            </div>
            {selectedRecords.map((r) => (
              <article className="sd-record" key={r.id}>
                <div className="sd-record-main">
                  <span className="sd-record-icon">
                    <FilePenLine size={20} />
                  </span>
                  <strong>{learningFieldLabel(r.field)}</strong>
                  <span>{duration(r.minutes)}</span>
                  {own && (
                    <button
                      disabled={deleting}
                      className="icon-button"
                      aria-label={`${learningFieldLabel(r.field)}の学習記録を削除`}
                      onClick={async () => {
                        if (!confirm("この学習記録とメモを削除しますか？"))
                          return;
                        setDeleting(true);
                        try {
                          await onDelete(r.id);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {r.memo && (
                  <p className="sd-record-memo">
                    {r.memo}
                    <small>学習メモ</small>
                  </p>
                )}
              </article>
            ))}
            {!selectedRecords.length && (
              <p className="sd-no-record">この日の学習記録はありません。</p>
            )}
            {data.records_truncated && (
              <p className="form-note">
                記録の一覧は月内の最新1,000件です。グラフは全件を集計しています。
              </p>
            )}
            {own && (
              <button className="sd-add-record" onClick={() => onAdd(selected)}>
                <Plus size={22} />
                記録を追加
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
