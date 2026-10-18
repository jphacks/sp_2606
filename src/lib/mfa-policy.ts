// Only call with a token whose signature/user was verified by Supabase getUser.
export function needsMfa(
  token: string,
  factors: { status: string }[] | undefined,
) {
  if (!factors?.some((f) => f.status === "verified")) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return payload.aal !== "aal2";
  } catch {
    return true;
  }
}
