import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runAgent = vi.fn();
vi.mock("@/lib/ai/agent", () => ({ runAgent }));

const ENV = {
  GOOGLE_API_KEY: "test-key",
  GOOGLE_CHAT_MODEL: "test-chat",
  GOOGLE_EMBEDDING_MODEL: "test-embed",
  QDRANT_URL: "http://localhost:6333",
  MEMORY_BACKEND: "memory",
};

async function post(body: string) {
  const { POST } = await import("@/app/api/chat/route");
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
  return { status: response.status, json: await response.json(), headers: response.headers };
}

describe("POST /api/chat", () => {
  beforeEach(async () => {
    vi.resetModules();
    runAgent.mockReset();
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns {reply} and uses sessionId as the conversation thread", async () => {
    runAgent.mockResolvedValue("হ্যালো! আমি নোভা।");
    const res = await post(JSON.stringify({ message: "Hello Nova", sessionId: "demo-session-001" }));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ reply: "হ্যালো! আমি নোভা।" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(runAgent).toHaveBeenCalledWith(
      { message: "Hello Nova", sessionId: "demo-session-001" },
      expect.anything(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: "Invalid request" });
  });

  it("rejects an empty message with 400", async () => {
    const res = await post(JSON.stringify({ message: "  ", sessionId: "s1" }));
    expect(res.status).toBe(400);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("returns a friendly 503 without internals when the model or Qdrant fails", async () => {
    runAgent.mockRejectedValue(new Error("ECONNREFUSED qdrant:6333 secret-stack"));
    const res = await post(JSON.stringify({ message: "hi", sessionId: "s1" }));
    expect(res.status).toBe(503);
    expect(res.json).toEqual({ error: "SU Agent is temporarily unavailable. Please retry." });
  });

  it("returns 503 when configuration is missing", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "replace_me");
    const res = await post(JSON.stringify({ message: "hi", sessionId: "s1" }));
    expect(res.status).toBe(503);
    expect(runAgent).not.toHaveBeenCalled();
  });
});

describe("GET /api/health", () => {
  it("responds ok without exposing secrets", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "super-secret");
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text).status).toBe("ok");
    expect(text).not.toContain("super-secret");
    vi.unstubAllEnvs();
  });
});

describe("POST /api/tts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function tts(body: unknown) {
    const { POST } = await import("@/app/api/tts/route");
    return POST(new Request("http://localhost/api/tts", { method: "POST", body: JSON.stringify(body) }));
  }

  it("rejects empty text", async () => {
    expect((await tts({ text: "  " })).status).toBe(400);
  });

  it("returns 503 (client falls back to browser voice) when GOOGLE_TTS_MODEL is unset", async () => {
    expect((await tts({ text: "হ্যালো" })).status).toBe(503);
  });

  it("returns WAV audio from Gemini PCM", async () => {
    vi.stubEnv("GOOGLE_TTS_MODEL", "test-tts");
    const pcm = Buffer.alloc(960).toString("base64");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: pcm } }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await tts({ text: "আমি নোভা" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect((await res.arrayBuffer()).byteLength).toBe(44 + 960);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("models/test-tts:generateContent");
    expect(JSON.parse(init.body).generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
  });

  it("passes through audio that is already WAV (no double header)", async () => {
    vi.stubEnv("GOOGLE_TTS_MODEL", "test-tts");
    const { pcmToWav } = await import("@/lib/ai/tts");
    const wav = pcmToWav(Buffer.alloc(100));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }] } }],
        }),
      ),
    );
    const res = await tts({ text: "আমি নোভা" });
    expect((await res.arrayBuffer()).byteLength).toBe(wav.length);
  });

  it("returns 503 when Gemini TTS fails", async () => {
    vi.stubEnv("GOOGLE_TTS_MODEL", "test-tts");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));
    expect((await tts({ text: "হ্যালো" })).status).toBe(503);
  });
});

describe("POST /api/stt", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function stt(body: BodyInit, type = "audio/wav") {
    const { POST } = await import("@/app/api/stt/route");
    return POST(new Request("http://localhost/api/stt", { method: "POST", headers: { "Content-Type": type }, body }));
  }

  it("rejects unsupported content types and empty audio", async () => {
    expect((await stt("hello", "text/plain")).status).toBe(400);
    expect((await stt(new Uint8Array(0))).status).toBe(400);
  });

  it("transcribes with GOOGLE_STT_MODEL, minimal thinking, and ignores thought parts", async () => {
    vi.stubEnv("GOOGLE_STT_MODEL", "test-lite");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: " হ্যালো নোভা " }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await stt(new Uint8Array([82, 73, 70, 70, 1, 2, 3]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "হ্যালো নোভা" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("models/test-lite:generateContent");
    const body = JSON.parse(init.body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("audio/wav");
  });

  it("retries without thinkingConfig when the model rejects it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad field", { status: 400 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "ঠিক আছে" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await stt(new Uint8Array([1, 2, 3]));
    expect(await res.json()).toEqual({ text: "ঠিক আছে" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("returns 503 when transcription fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));
    expect((await stt(new Uint8Array([1, 2, 3]))).status).toBe(503);
  });
});
