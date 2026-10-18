import { z } from "zod";
export const deletionInput = z
  .object({
    password: z.string().min(1).max(128),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    confirmation: z.literal("退会する"),
  })
  .strict();
// The target always comes from the server's authenticated session, never JSON.
export async function authorizeDeletion(
  user: {
    id: string;
    email?: string;
    factors?: { id: string; factor_type: string; status: string }[];
  },
  input: z.infer<typeof deletionInput>,
  verifyPassword: (
    email: string,
    password: string,
  ) => Promise<string | undefined>,
  verifyFactor: (factorId: string, code: string) => Promise<boolean>,
) {
  if (
    !user.email ||
    (await verifyPassword(user.email, input.password)) !== user.id
  )
    throw new Error("password_required");
  const factors = (user.factors || []).filter((f) => f.status === "verified");
  if (factors.length) {
    const totp = factors.find((f) => f.factor_type === "totp");
    if (!totp || !input.code || !(await verifyFactor(totp.id, input.code)))
      throw new Error("mfa_required");
  }
}
