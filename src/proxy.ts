import { incidentMode } from "./lib/incident-policy";
import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${dev ? "ws:" : ""}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self';`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const stopped = incidentMode(process.env) === "all";
  const response = stopped
    ? new NextResponse(
        request.nextUrl.pathname.startsWith("/api/")
          ? JSON.stringify({
              error: "メンテナンス中です。しばらくしてからお試しください。",
            })
          : '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CoStep</title><main><h1>CoStep</h1><p>メンテナンス中です。しばらくしてからお試しください。</p></main></html>',
        {
          status: 503,
          headers: {
            "Content-Type": request.nextUrl.pathname.startsWith("/api/")
              ? "application/json; charset=utf-8"
              : "text/html; charset=utf-8",
            "Retry-After": "300",
          },
        },
      )
    : NextResponse.next({ request: { headers } });
  if (stopped) {
    for (const name of [
      "__Host-sc-session",
      "sc-session",
      "__Host-sc-recovery",
      "sc-recovery",
      "__Host-sc-mfa-recovery",
      "sc-mfa-recovery",
      "sc-pkce",
      "sc-csrf",
    ]) {
      response.cookies.set(name, "", {
        httpOnly: true,
        secure: !dev,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
  }
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
