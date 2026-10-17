import { NextResponse } from "next/server";
import { pkceClient, saveSession, config } from "@/lib/server";
export async function GET(request: Request) {
  const c = config();
  if (!c) return NextResponse.redirect(new URL("/?auth=failed", request.url));
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    try {
      const { client, persist } = await pkceClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      persist();
      if (!error && data.session) {
        await saveSession(data.session);
        return NextResponse.redirect(c.origin + "/?auth=confirmed");
      }
    } catch {}
  }
  return NextResponse.redirect(c.origin + "/?auth=failed");
}
