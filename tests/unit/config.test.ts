import { describe, expect, it } from "vitest";
import { ConfigError, inspectConfig, loadConfig } from "@/lib/config";

const base = {
  GOOGLE_API_KEY: "k",
  GOOGLE_CHAT_MODEL: "chat-model",
  GOOGLE_EMBEDDING_MODEL: "embed-model",
  QDRANT_URL: "https://qdrant.example/",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
} as unknown as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("loads defaults", () => {
    const config = loadConfig(base);
    expect(config.qdrantCollection).toBe("my_custom_agent_db");
    expect(config.qdrantUrl).toBe("https://qdrant.example");
    expect(config.memoryBackend).toBe("postgres");
  });

  it("treats placeholders as missing", () => {
    expect(() => loadConfig({ ...base, GOOGLE_API_KEY: "replace_me" })).toThrow(ConfigError);
  });

  it("requires DATABASE_URL only for the postgres backend", () => {
    const rest = { ...base };
    delete rest.DATABASE_URL;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
    expect(loadConfig({ ...rest, MEMORY_BACKEND: "memory" }).memoryBackend).toBe("memory");
  });

  it("keeps the request timeout under the route limit", () => {
    expect(loadConfig({ ...base, REQUEST_TIMEOUT_MS: "120000" }).requestTimeoutMs).toBe(45000);
  });

  it("reports configuration status without values", () => {
    expect(inspectConfig(base)).toEqual({
      google: true,
      qdrant: true,
      database: true,
      memoryBackend: "postgres",
    });
  });
});
