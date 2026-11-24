import type { AppConfig } from "../config";

export const TTS_MAX_CHARS = 1500;
const SAMPLE_RATE = 24000; // Gemini TTS returns 16-bit mono PCM at 24 kHz.

export class TtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsUnavailableError";
  }
}

/** Strips markdown/URLs so the voice reads natural sentences. */
export function prepareSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>`~|[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TTS_MAX_CHARS);
}

/** Wraps raw 16-bit little-endian mono PCM in a WAV header so browsers can play it. */
export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

interface GeminiAudioResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
}

export async function synthesizeSpeech(
  text: string,
  config: AppConfig,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!config.googleTtsModel) {
    throw new TtsUnavailableError("GOOGLE_TTS_MODEL is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.googleTtsModel)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.googleApiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Read the following Bangla text aloud in a warm, friendly, natural voice:\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.googleTtsVoice } } },
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new TtsUnavailableError(`Gemini TTS request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as GeminiAudioResponse;
  const inline = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) {
    throw new TtsUnavailableError("Gemini TTS returned no audio.");
  }

  const audio = Buffer.from(inline.data, "base64");
  // Newer TTS models return a complete WAV; older ones return raw 16-bit PCM ("audio/L16;rate=24000").
  if (/wav/i.test(inline.mimeType ?? "") || audio.toString("ascii", 0, 4) === "RIFF") {
    return audio;
  }
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? SAMPLE_RATE);
  return pcmToWav(audio, rate);
}
