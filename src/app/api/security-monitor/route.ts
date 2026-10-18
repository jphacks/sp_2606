import { NextResponse } from "next/server";
import { verifyMonitorToken } from "@/lib/monitor-oidc";
import { monitorStore } from "@/lib/security-monitor";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const value = request.headers.get("authorization") || "";
    if (!value.startsWith("Bearer ")) throw new Error("unauthorized");
    await verifyMonitorToken(value.slice(7));
  } catch {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  }
  try {
    if (process.env.SECURITY_METRICS_ENABLED !== "true")
      throw new Error("monitor_disabled");
    const result = await monitorStore()
      .rpc("read_security_metrics")
      .abortSignal(AbortSignal.timeout(3000));
    if (result.error) throw new Error("monitor_unavailable");
    return NextResponse.json(result.data, { headers });
  } catch {
    return NextResponse.json(
      { error: "monitor_unavailable" },
      { status: 503, headers },
    );
  }
}
