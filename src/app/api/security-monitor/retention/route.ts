import { NextResponse } from "next/server";
import { verifyMonitorToken } from "@/lib/monitor-oidc";
import { monitorStore } from "@/lib/security-monitor";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) throw new Error("unauthorized");
    await verifyMonitorToken(authorization.slice(7));
  } catch {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  }
  try {
    const result = await monitorStore()
      .rpc("cleanup_retained_data")
      .abortSignal(AbortSignal.timeout(5000));
    if (result.error) throw new Error("cleanup_failed");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "retention_cleanup_unavailable" },
      { status: 503, headers },
    );
  }
}
