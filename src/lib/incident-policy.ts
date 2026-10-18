/** Server configuration only. Unknown values fail closed. No secrets belong here. */
export function incidentMode(env: Record<string, string | undefined>) {
  const value = env.COSTEP_INCIDENT_MODE?.trim() || "none";
  return value === "none" || value === "recovery" || value === "all"
    ? value
    : "all";
}
export function sessionAllowedSince(
  created: number,
  env: Record<string, string | undefined>,
) {
  const cutoff = env.SESSION_NOT_BEFORE?.trim();
  if (!cutoff) return true;
  // Require UTC ISO format; malformed emergency configuration denies sessions.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(cutoff))
    return false;
  const time = Date.parse(cutoff);
  return Number.isFinite(time) && Number.isFinite(created) && created >= time;
}
