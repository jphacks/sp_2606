import { z } from "zod";
export const visibilitySchema = z.enum(["public", "mutual", "private"]);
export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(30),
    field: z.string().trim().min(1).max(30),
    level: z.number().int().min(0).max(3),
    goal: z.string().trim().max(100),
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
    visibility: visibilitySchema,
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
export const levels = ["未経験", "初級", "中級", "上級"];
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
  goal: string;
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
  return (
    (viewer.field === candidate.field ? 100 : 0) +
    Math.max(0, 3 - Math.abs(viewer.level - candidate.level)) * 10 +
    (viewer.goal && viewer.goal === candidate.goal ? 20 : 0)
  );
}
