import { z } from "zod";
import { learningFieldLabel } from "./learning-catalog";
import {
  goalsSchema,
  goalSimilarity,
  targetLevels,
  type LearningGoal,
} from "./goals";
export const visibilitySchema = z.enum(["public", "mutual", "private"]);
export const fieldOptions = [
  "Python",
  "JavaScript",
  "TypeScript",
  "AWS",
  "基本情報",
  "応用情報",
  "その他",
];
export const learningFieldSchema = z.discriminatedUnion("mode", [
  z
    .object({
      field: z.string().trim().min(1).max(30),
      mode: z.literal("level"),
      level: z.number().int().min(0).max(4),
      total_minutes: z.null(),
    })
    .strict(),
  z
    .object({
      field: z.string().trim().min(1).max(30),
      mode: z.literal("time"),
      level: z.null(),
      total_minutes: z.number().int().min(0).max(6000000),
    })
    .strict(),
]);
export const learningFieldsSchema = z
  .array(learningFieldSchema)
  .min(1)
  .max(10)
  .refine(
    (items) =>
      new Set(items.map((x) => x.field.toLowerCase())).size === items.length,
    "分野が重複しています。",
  );
export type LearningField = z.infer<typeof learningFieldSchema>;
export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(30),
    learning_fields: learningFieldsSchema,
    goals: goalsSchema,
    bio: z.string().trim().max(500),
    recommend: z.boolean(),
    visibility: visibilitySchema,
    dm_policy: z.enum(["mutual", "anyone"]),
  })
  .strict();
export const signupSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
export const loginSchema = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
  .strict();
export const studySchema = z
  .object({
    field: z.string().trim().min(1).max(30),
    date: z.iso.date(),
    minutes: z.number().int().min(1).max(1440),
    request_id: z.uuid(),
  })
  .strict();
export const postSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
export const targetSchema = z
  .object({ target: z.uuid(), enabled: z.boolean() })
  .strict();
export const deleteSchema = z.object({ id: z.uuid() }).strict();
export const levels = targetLevels;
export const visibilityLabels = {
  public: "ログイン済み全員",
  mutual: "相互フォローのみ",
  private: "自分のみ",
};
export type Profile = {
  id: string;
  display_name: string;
  field: string;
  level: number;
  learning_fields?: LearningField[];
  goal: string;
  goals?: LearningGoal[];
  bio: string;
  recommend: boolean;
  created_at: string;
};
export type Post = {
  id: string;
  owner_id: string;
  body: string;
  created_at: string;
};
export type Study = {
  id: string;
  owner_id: string;
  field: string;
  study_date: string;
  minutes: number;
};
export function recommendationScore(viewer: Profile, candidate: Profile) {
  let best = 0;
  for (const a of profileFields(viewer))
    for (const b of profileFields(candidate)) {
      if (a.field !== b.field) continue;
      let score = 100;
      if (a.mode === "level" && b.mode === "level")
        score += Math.max(0, 4 - Math.abs(a.level - b.level)) * 7.5;
      if (a.mode === "time" && b.mode === "time")
        score +=
          30 /
          (1 +
            Math.abs(
              Math.log((a.total_minutes + 60) / (b.total_minutes + 60)),
            ));
      best = Math.max(best, score);
    }
  return best + goalSimilarity(viewer.goals, candidate.goals);
}
export function profileFields(profile: Profile): LearningField[] {
  return profile.learning_fields?.length
    ? profile.learning_fields
    : [
        {
          field: profile.field,
          mode: "level",
          level: profile.level,
          total_minutes: null,
        },
      ];
}
export function fieldExperience(item: LearningField) {
  return item.mode === "level"
    ? levels[item.level]
    : `累計${(item.total_minutes / 60).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}時間`;
}
export function profileSummary(profile: Profile) {
  return profileFields(profile)
    .map(
      (item) => `${learningFieldLabel(item.field)} · ${fieldExperience(item)}`,
    )
    .join(" / ");
}
