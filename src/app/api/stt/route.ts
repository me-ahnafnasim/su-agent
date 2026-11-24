import "server-only";
import { getConfig } from "@/lib/config";
import { STT_MAX_BYTES, STT_MIME_TYPES, SttUnavailableError, transcribeAudio } from "@/lib/ai/stt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** POST raw audio (16 kHz mono WAV from the browser) → {"text": "..."} */
export async function POST(request: Request): Promise<Response> {
  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!STT_MIME_TYPES.includes(mimeType)) return json({ error: "Invalid request" }, 400);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > STT_MAX_BYTES) return json({ error: "Invalid request" }, 413);

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length === 0) return json({ error: "Invalid request" }, 400);
  if (audio.length > STT_MAX_BYTES) return json({ error: "Invalid request" }, 413);

  let config;
  try {
    config = getConfig();
  } catch {
    return json({ error: "Voice input is temporarily unavailable." }, 503);
  }

  try {
    const text = await transcribeAudio(audio, mimeType, config, AbortSignal.timeout(30_000));
    return json({ text }, 200);
  } catch (error) {
    console.error(`[api/stt] ${error instanceof SttUnavailableError ? error.message : "transcription failed"}`);
    return json({ error: "Voice input is temporarily unavailable." }, 503);
  }
}
