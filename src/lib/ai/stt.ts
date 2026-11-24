import type { AppConfig } from "../config";

export const STT_MAX_BYTES = 3 * 1024 * 1024; // ~90 s of 16 kHz mono WAV
export const STT_MIME_TYPES = ["audio/wav", "audio/x-wav", "audio/ogg", "audio/mpeg", "audio/flac"];

export class SttUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttUnavailableError";
  }
}

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

/**
 * Transcribes a short Bangla voice clip with the configured Gemini chat model.
 * Used where the browser's own speech recognition is unavailable (e.g. Brave).
 */
const PROMPT =
  "Transcribe this voice message exactly as spoken. It is usually Bangla (write it in Bengali script); " +
  "keep English words in English. The assistant being addressed is named SU Agent (এসইউ এজেন্ট). " +
  "Output only the transcript, with no quotes, labels or commentary. If there is no intelligible speech, output nothing.";

async function callGemini(
  audio: Buffer,
  mimeType: string,
  config: AppConfig,
  minimalThinking: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.googleSttModel)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.googleApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: audio.toString("base64") } }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          // Thinking adds many seconds and does not help transcription.
          ...(minimalThinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
      signal,
    },
  );
}

/**
 * Transcribes a short Bangla voice clip with Gemini (GOOGLE_STT_MODEL, default: chat model).
 * Used where the browser's own speech recognition is unavailable (e.g. Brave).
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  config: AppConfig,
  signal?: AbortSignal,
): Promise<string> {
  let response = await callGemini(audio, mimeType, config, true, signal);
  if (response.status === 400) {
    // Models without thinkingLevel support reject the field; retry plainly.
    response = await callGemini(audio, mimeType, config, false, signal);
  }
  if (!response.ok) {
    throw new SttUnavailableError(`Gemini transcription failed with status ${response.status}.`);
  }
  const data = (await response.json()) as GeminiTextResponse;
  return (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}
