import "server-only";
import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, equal } from "./session-crypto";
import { needsMfa } from "./mfa-policy";
import { issueRecoveryProof, verifyRecoveryProof } from "./recovery-proof";
export function config() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY,
    secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!url || !key || !secret || Buffer.from(secret, "base64").length !== 32)
    return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return null;
  return {
    url,
    key,
    secret,
    origin: process.env.APP_ORIGIN || "http://127.0.0.1:3000",
  };
}
export const cookieName =
  process.env.NODE_ENV === "production" ? "__Host-sc-session" : "sc-session";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
type Envelope = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  created: number;
  seen: number;
  user_id: string;
};
export function authClient() {
  const c = config();
  if (!c) throw new Error("not_configured");
  return createClient(c.url, c.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function saveSession(session: Session, created = Date.now()) {
  const c = config();
  if (!c) throw new Error("not_configured");
  await clearRecoveryProof();
  const data: Envelope = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? 0,
    created,
    seen: Date.now(),
    user_id: session.user.id,
  };
  (await cookies()).set(cookieName, encrypt(data, c.secret), {
    ...options,
    maxAge: 7 * 86400,
  });
}
export async function clearSession() {
  await clearRecoveryProof();
  (await cookies()).set(
    process.env.NODE_ENV === "production"
      ? "__Host-sc-mfa-recovery"
      : "sc-mfa-recovery",
    "",
    { ...options, maxAge: 0 },
  );
  (await cookies()).set(cookieName, "", { ...options, maxAge: 0 });
}
const recoveryCookie =
  process.env.NODE_ENV === "production" ? "__Host-sc-recovery" : "sc-recovery";
export async function clearRecoveryProof() {
  (await cookies()).set(recoveryCookie, "", { ...options, maxAge: 0 });
}
export async function grantRecovery(userId: string, token: string) {
  const c = config();
  if (!c) throw new Error("not_configured");
  (await cookies()).set(
    recoveryCookie,
    issueRecoveryProof(userId, token, c.secret),
    { ...options, maxAge: 600 },
  );
}
export async function canRecover(userId: string, token: string) {
  const c = config();
  const raw = (await cookies()).get(recoveryCookie)?.value;
  return !!c && !!raw && verifyRecoveryProof(raw, userId, token, c.secret);
}
export async function csrf() {
  const jar = await cookies();
  let token = jar.get("sc-csrf")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set("sc-csrf", token, { ...options, maxAge: 86400 });
  }
  return token;
}
export async function validateMutation(request: Request, maxBytes = 16384) {
  const origin =
    config()?.origin || process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  if (request.headers.get("origin") !== origin)
    throw new Error("invalid_origin");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid_content_type");
  const token = (await cookies()).get("sc-csrf")?.value,
    supplied = request.headers.get("x-csrf-token");
  if (!token || !supplied || !equal(token, supplied))
    throw new Error("invalid_csrf");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("too_large");
}
export async function jsonBody(request: Request, maxBytes = 16384) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("too_large");
  return JSON.parse(raw);
}
export async function currentSession(allowMfaPending = false) {
  const c = config();
  if (!c) return null;
  const raw = (await cookies()).get(cookieName)?.value;
  if (!raw) return null;
  let e = decrypt<Envelope>(raw, c.secret);
  if (
    !e ||
    !e.access_token ||
    !e.refresh_token ||
    !Number.isFinite(e.created) ||
    !Number.isFinite(e.seen) ||
    Date.now() - e.created > 7 * 86400000 ||
    Date.now() - e.seen > 86400000
  ) {
    await clearSession();
    return null;
  }
  const auth = authClient();
  if (e.expires_at * 1000 < Date.now() + 30000) {
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: e.refresh_token,
    });
    if (error || !data.session || data.session.user.id !== e.user_id) {
      await clearSession();
      return null;
    }
    await saveSession(data.session, e.created);
    e = {
      ...e,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? 0,
    };
  }
  const { data, error } = await auth.auth.getUser(e.access_token);
  if (error || !data.user || data.user.id !== e.user_id) {
    await clearSession();
    return null;
  }
  const db = createClient(c.url, c.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${e.access_token}` } },
  });
  const gate = await db.rpc("mfa_status");
  if (
    gate.error &&
    gate.error.code !== "PGRST202" &&
    gate.error.code !== "42883"
  )
    return null;
  if (gate.data?.revoked) {
    await clearSession();
    return null;
  }
  const mfaReenroll = gate.data?.reenroll === true;
  const mfaCanEnroll = gate.data?.can_enroll === true;
  const mfaRequired =
    needsMfa(e.access_token, data.user.factors) || gate.data?.required === true;
  if (mfaRequired && !allowMfaPending) return null;
  const { data: settings, error: denied } = mfaRequired
    ? { data: gate.data, error: gate.error }
    : await db.rpc("get_settings");
  if (denied) {
    await clearSession();
    return null;
  }
  // Refresh idle timestamp on verified activity; never extend the absolute lifetime.
  (await cookies()).set(
    cookieName,
    encrypt({ ...e, seen: Date.now() }, c.secret),
    {
      ...options,
      maxAge: Math.max(
        1,
        Math.floor((e.created + 7 * 86400000 - Date.now()) / 1000),
      ),
    },
  );
  return {
    db,
    user: data.user,
    settings,
    token: e.access_token,
    refreshToken: e.refresh_token,
    created: e.created,
    mfaRequired,
    mfaReenroll,
    mfaCanEnroll,
  };
}
export async function pkceClient() {
  const c = config();
  if (!c) throw new Error("not_configured");
  const jar = await cookies();
  const raw = jar.get("sc-pkce")?.value;
  const stored = raw
    ? decrypt<{
        values: Record<string, string>;
        created: number;
        purpose?: string;
      }>(raw, c.secret)
    : null;
  const values =
    stored && Date.now() - stored.created < 3600000 ? stored.values : {};
  const client = createClient(c.url, c.key, {
    auth: {
      flowType: "pkce",
      // Required for GoTrue to use our request-local storage adapter.
      // persist() below saves only the verifier in an encrypted HttpOnly cookie.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => values[key] ?? null,
        setItem: (key, value) => {
          values[key] = value;
        },
        removeItem: (key) => {
          delete values[key];
        },
      },
    },
  });
  return {
    client,
    recovery:
      !!stored &&
      Date.now() - stored.created < 3600000 &&
      stored.purpose === "recovery",
    persist: (purpose?: "recovery") => {
      const verifier = Object.fromEntries(
        Object.entries(values).filter(([k]) => k.endsWith("-code-verifier")),
      );
      jar.set(
        "sc-pkce",
        encrypt({ values: verifier, created: Date.now(), purpose }, c.secret),
        { ...options, maxAge: 3600 },
      );
    },
  };
}
