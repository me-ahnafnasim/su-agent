import { NextResponse } from "next/server";
import { inspectConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const status = inspectConfig();

  return NextResponse.json(
    {
      status: "ok",
      service: "nova-agent",
      time: new Date().toISOString(),
      memoryBackend: status.memoryBackend,
      checks: {
        googleConfigured: status.google,
        qdrantConfigured: status.qdrant,
        databaseConfigured: status.database,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
