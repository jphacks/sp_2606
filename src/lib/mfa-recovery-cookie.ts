import "server-only";
import { cookies } from "next/headers";
import { encrypt, decrypt } from "./session-crypto";
import { config } from "./server";
const name =
  process.env.NODE_ENV === "production"
    ? "__Host-sc-mfa-recovery"
    : "sc-mfa-recovery";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function setMfaRecoveryCookie(userId: string, requestId: string) {
  const c = config();
  if (!c) throw new Error("not_configured");
  (await cookies()).set(
    name,
    encrypt({ userId, requestId, issued: Date.now() }, c.secret),
    { ...options, maxAge: 600 },
  );
}
export async function readMfaRecoveryCookie(userId: string) {
  const c = config(),
    raw = (await cookies()).get(name)?.value;
  if (!c || !raw) return null;
  const d = decrypt<{ userId: string; requestId: string; issued: number }>(
    raw,
    c.secret,
  );
  return d?.userId === userId &&
    typeof d.requestId === "string" &&
    Number.isFinite(d.issued) &&
    Date.now() >= d.issued &&
    Date.now() - d.issued < 600000
    ? d
    : null;
}
export async function clearMfaRecoveryCookie() {
  (await cookies()).set(name, "", { ...options, maxAge: 0 });
}
