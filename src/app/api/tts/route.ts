import "server-only";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { prepareSpeechText, synthesizeSpeech, TtsUnavailableError } from "@/lib/ai/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ text: z.string().trim().min(1).max(4000) });
const TTS_TIMEOUT_MS = 30_000;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Natural Nova voice. The client falls back to browser speechSynthesis on any non-200. */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request");

  const text = prepareSpeechText(parsed.data.text);
  if (!text) return error(400, "Invalid request");

  let config;
  try {
    config = getConfig();
  } catch {
    return error(503, "Voice is temporarily unavailable.");
  }
  if (!config.googleTtsModel) return error(503, "Voice is temporarily unavailable.");

  try {
    const wav = await synthesizeSpeech(text, config, AbortSignal.timeout(TTS_TIMEOUT_MS));
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(
      `[api/tts] ${err instanceof TtsUnavailableError ? err.message : "synthesis failed"}`,
    );
    return error(503, "Voice is temporarily unavailable.");
  }
}
