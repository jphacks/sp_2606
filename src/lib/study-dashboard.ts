export type DailyStudy = { study_date: string; field: string; minutes: number };
export function shiftDay(day: string, offset: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function weekStart(day: string) {
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}
export function monthCells(month: string) {
  const first = month + "-01";
  const date = new Date(first + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1);
  const next = date.toISOString().slice(0, 10);
  const start = weekStart(first);
  const days = Math.round((Date.parse(next) - Date.parse(start)) / 86400000);
  return Array.from({ length: Math.ceil(days / 7) * 7 }, (_, i) =>
    shiftDay(start, i),
  );
}
export function studySummary(rows: DailyStudy[], from: string, to: string) {
  const days: Record<string, number> = {};
  const fields: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    if (row.study_date < from || row.study_date > to) continue;
    days[row.study_date] = (days[row.study_date] || 0) + row.minutes;
    fields[row.field] = (fields[row.field] || 0) + row.minutes;
    total += row.minutes;
  }
  return {
    total,
    days,
    fields: Object.entries(fields).sort((a, b) => b[1] - a[1]),
  };
}
export function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
export function heatLevel(minutes: number) {
  return minutes >= 240
    ? 5
    : minutes >= 120
      ? 4
      : minutes >= 60
        ? 3
        : minutes >= 30
          ? 2
          : minutes > 0
            ? 1
            : 0;
}

// Keep each field's color stable across days, months and both chart types.
export function studyFieldColor(field: string) {
  const known: Record<string, string> = {
    Python: "#20b7af",
    AWS: "#ff9857",
    "Microsoft Azure": "#598ce2",
    基本情報: "#aa8bdf",
    応用情報: "#e4b74f",
    Go: "#43b5d0",
    JavaScript: "#e8bb40",
    TypeScript: "#668be0",
    Java: "#e17868",
    Rust: "#c98161",
    その他: "#91a7b4",
  };
  if (known[field]) return known[field];
  let hash = 0;
  for (const char of field)
    hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  return `hsl(${(hash >>> 0) % 360} 58% 60%)`;
}
