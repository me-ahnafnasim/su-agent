import { describe, expect, it } from "vitest";
import { pcmToWav, prepareSpeechText, TTS_MAX_CHARS } from "@/lib/ai/tts";

describe("prepareSpeechText", () => {
  it("removes markdown, code and URLs so the voice reads natural text", () => {
    expect(prepareSpeechText("**হ্যালো** `x` দেখুন https://example.com\n```js\ncode\n```"))
      .toBe("হ্যালো x দেখুন");
  });

  it("caps very long replies", () => {
    expect(prepareSpeechText("ক".repeat(5000))).toHaveLength(TTS_MAX_CHARS);
  });
});

describe("pcmToWav", () => {
  it("writes a valid 16-bit mono WAV header", () => {
    const wav = pcmToWav(Buffer.alloc(480), 24000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(480);
    expect(wav.length).toBe(44 + 480);
  });
});
