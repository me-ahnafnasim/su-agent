import "server-only";
import { NextResponse } from "next/server";
import { ConfigError, getConfig } from "@/lib/config";
import { parseChatRequest } from "@/lib/validation";
import { runAgent } from "@/lib/ai/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INVALID_REQUEST = { error: "Invalid request" };
const UNAVAILABLE = { error: "SU Agent is temporarily unavailable. Please retry." };

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(INVALID_REQUEST, 400);
  }

  const parsed = parseChatRequest(payload);
  if (!parsed.success) {
    return jsonResponse(INVALID_REQUEST, 400);
  }

  let config;
  try {
    config = getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[api/chat] configuration error:", error.missing.join(", "));
      return jsonResponse(UNAVAILABLE, 503);
    }
    console.error("[api/chat] failed to load configuration", error);
    return jsonResponse(UNAVAILABLE, 503);
  }

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);

  const deadline = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("Request deadline exceeded")),
      { once: true },
    );
  });

  try {
    const reply = await Promise.race([
      runAgent(
        { message: parsed.data.message, sessionId: parsed.data.sessionId },
        config,
        { signal: controller.signal },
      ),
      deadline,
    ]);

    return jsonResponse({ reply }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      `[api/chat] ${timedOut ? "request timed out" : "agent failure"}: ${message}`,
    );
    return jsonResponse(UNAVAILABLE, 503);
  } finally {
    clearTimeout(timer);
  }
}
