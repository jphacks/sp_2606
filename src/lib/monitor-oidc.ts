import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export const monitorAudience = "costep-security-monitor";
const issuer = "https://token.actions.githubusercontent.com";
const jwks = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"), {
  timeoutDuration: 3000,
  cooldownDuration: 30000,
  cacheMaxAge: 600000,
});
export async function verifyMonitorToken(
  token: string,
  keys: JWTVerifyGetKey = jwks,
) {
  if (token.length > 16000) throw new Error("Invalid monitor token");
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: monitorAudience,
    algorithms: ["RS256"],
    maxTokenAge: "10m",
    clockTolerance: 5,
    requiredClaims: ["exp", "iat", "sub"],
  });
  if (
    payload.sub !== "repo:jphacks/sp_2606:ref:refs/heads/main" ||
    payload.repository !== "jphacks/sp_2606" ||
    payload.repository_id !== "1400418256" ||
    payload.repository_owner_id !== "10176253" ||
    payload.ref !== "refs/heads/main" ||
    payload.workflow_ref !==
      "jphacks/sp_2606/.github/workflows/runtime-monitor.yml@refs/heads/main" ||
    !["schedule", "workflow_dispatch"].includes(String(payload.event_name))
  )
    throw new Error("Invalid monitor identity");
}
