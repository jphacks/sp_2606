import { z } from "zod";
import catalogData from "@/data/goal-catalog.json";
export type CatalogItem = {
  id: string;
  kind: "certification" | "technology";
  category: string;
  label: string;
  aliases: string[];
  source_url: string;
  verified_on: string;
  active: boolean;
};
export const goalCatalog = catalogData as CatalogItem[];
export const goalCatalogById = new Map(
  goalCatalog.map((item) => [item.id, item]),
);
// Storage uses 0..4; the UI consistently displays Lv.1..Lv.5.
export const targetLevels = [
  "興味・入門",
  "基礎理解",
  "基本実践",
  "自立・活用",
  "応用・発展",
];
export const levelDescriptions = [
  "興味があり、これから学びたい・学び始めた段階",
  "基本的な知識や仕組みを理解している段階",
  "手順や参考資料をもとに、基本的な課題に取り組める段階",
  "自分で方法を考え、技術を活用して課題を解決できる段階",
  "複雑な課題にも対応し、改善や他者への支援ができる段階",
];
const month = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/);
export const goalSchema = z
  .object({
    catalog_id: z.string().min(1).max(80),
    start_month: month,
    target_month: month,
    target_level: z.number().int().min(0).max(4).nullable(),
  })
  .strict()
  .superRefine((goal, ctx) => {
    const item = goalCatalogById.get(goal.catalog_id);
    if (!item?.active)
      ctx.addIssue({
        code: "custom",
        message: "登録済みの目標を選んでください。",
      });
    if (
      item &&
      (item.kind === "technology"
        ? goal.target_level === null
        : goal.target_level !== null)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "技術には到達レベルが必要です。資格に到達レベルは設定できません。",
      });
    if (goal.start_month > goal.target_month)
      ctx.addIssue({
        code: "custom",
        message: "達成目標月は開始月以降にしてください。",
      });
  });
export const goalsSchema = z
  .array(goalSchema)
  .max(5)
  .refine(
    (items) => new Set(items.map((x) => x.catalog_id)).size === items.length,
    "目標が重複しています。",
  );
export type LearningGoal = z.infer<typeof goalSchema>;
export function goalMonths(goal: LearningGoal) {
  const [sy, sm] = goal.start_month.split("-").map(Number);
  const [ey, em] = goal.target_month.split("-").map(Number);
  return (ey - sy) * 12 + em - sm + 1;
}
export function goalLabel(goal: LearningGoal) {
  const item = goalCatalogById.get(goal.catalog_id);
  return `${item?.label || "登録済みの目標"}${goal.target_level !== null ? `：${targetLevels[goal.target_level]}` : ""}（${goal.start_month}〜${goal.target_month}・${goalMonths(goal)}か月）`;
}
export function profileGoalSummary(profile: {
  goals?: LearningGoal[];
  goal?: string;
}) {
  return profile.goals?.length ? profile.goals.map(goalLabel).join(" / ") : "";
}
export function goalSimilarity(a: LearningGoal[] = [], b: LearningGoal[] = []) {
  let best = 0;
  for (const x of a)
    for (const y of b) {
      const item = goalCatalogById.get(x.catalog_id);
      if (x.catalog_id !== y.catalog_id || !item?.active) continue;
      const monthsA = goalMonths(x),
        monthsB = goalMonths(y);
      let score =
        20 + (10 * Math.min(monthsA, monthsB)) / Math.max(monthsA, monthsB);
      if (
        item.kind === "technology" &&
        x.target_level !== null &&
        y.target_level !== null
      )
        score +=
          (Math.max(0, 4 - Math.abs(x.target_level - y.target_level)) * 10) / 4;
      best = Math.max(best, score);
    }
  return best;
}
export function searchGoals(query: string, kind: string = "all") {
  const normalize = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return goalCatalog.filter(
    (item) =>
      item.active &&
      (kind === "all" || item.kind === kind) &&
      tokens.every((token) =>
        normalize(
          [item.label, item.category, ...item.aliases].join(" "),
        ).includes(token),
      ),
  );
}
