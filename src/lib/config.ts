export type MemoryBackend = "postgres" | "memory";

export interface AppConfig {
  googleApiKey: string;
  googleChatModel: string;
  googleEmbeddingModel: string;
  googleEmbeddingDimensions?: number;
  /** Optional. Gemini TTS model for natural Bangla voice; browser voice is used when unset. */
  googleTtsModel: string;
  googleTtsVoice: string;
  /** Model used to transcribe recorded voice (browsers without speech recognition). Defaults to the chat model. */
  googleSttModel: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantCollection: string;
  databaseUrl: string;
  databaseSsl: boolean;
  memoryBackend: MemoryBackend;
  requestTimeoutMs: number;
  maxHistoryMessages: number;
  maxGraphSteps: number;
  qdrantTopK: number;
  qdrantScoreThreshold: number;
  embeddingChunkSize: number;
  embeddingChunkOverlap: number;
}

export interface ConfigStatus {
  google: boolean;
  qdrant: boolean;
  database: boolean;
  memoryBackend: MemoryBackend;
}

export class ConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing or invalid environment variables: ${missing.join(", ")}`);
    this.name = "ConfigError";
    this.missing = missing;
  }
}

const PLACEHOLDER_PREFIXES = ["replace_me", "replace_with_"];

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function readString(
  env: NodeJS.ProcessEnv,
  key: string,
  missing: string[],
  options: { required?: boolean; fallback?: string } = {},
): string {
  const value = env[key]?.trim();
  if (!value || isPlaceholder(value)) {
    if (options.required) {
      missing.push(key);
    }
    return options.fallback ?? "";
  }
  return value;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
  missing: string[],
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    missing.push(key);
    return fallback;
  }
  return parsed;
}

function readNumber(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
  missing: string[],
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    missing.push(key);
    return fallback;
  }
  return parsed;
}

function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing: string[] = [];

  const memoryBackend: MemoryBackend =
    env.MEMORY_BACKEND?.trim().toLowerCase() === "memory" ? "memory" : "postgres";

  const googleApiKey = readString(env, "GOOGLE_API_KEY", missing, { required: true });
  const googleChatModel = readString(env, "GOOGLE_CHAT_MODEL", missing, { required: true });
  const googleEmbeddingModel = readString(env, "GOOGLE_EMBEDDING_MODEL", missing, {
    required: true,
  });
  const qdrantUrl = readString(env, "QDRANT_URL", missing, { required: true }).replace(
    /\/+$/,
    "",
  );
  const qdrantApiKey = readString(env, "QDRANT_API_KEY", missing);
  const qdrantCollection =
    readString(env, "QDRANT_COLLECTION", missing, { fallback: "my_custom_agent_db" }) ||
    "my_custom_agent_db";
  const databaseUrl =
    memoryBackend === "postgres"
      ? readString(env, "DATABASE_URL", missing, { required: true })
      : readString(env, "DATABASE_URL", missing);

  const dimensionsRaw = env.GOOGLE_EMBEDDING_DIMENSIONS?.trim();
  let googleEmbeddingDimensions: number | undefined;
  if (dimensionsRaw) {
    const parsed = Number(dimensionsRaw);
    if (!Number.isInteger(parsed) || parsed < 64 || parsed > 8192) {
      missing.push("GOOGLE_EMBEDDING_DIMENSIONS");
    } else {
      googleEmbeddingDimensions = parsed;
    }
  }

  const embeddingChunkSize = readInteger(
    env,
    "EMBEDDING_CHUNK_SIZE",
    700,
    100,
    4000,
    missing,
  );
  const embeddingChunkOverlap = readInteger(
    env,
    "EMBEDDING_CHUNK_OVERLAP",
    120,
    0,
    Math.max(0, embeddingChunkSize - 1),
    missing,
  );

  if (missing.length > 0) {
    throw new ConfigError([...new Set(missing)]);
  }

  return {
    googleTtsModel: readString(env, "GOOGLE_TTS_MODEL", missing),
    googleTtsVoice: readString(env, "GOOGLE_TTS_VOICE", missing, { fallback: "Kore" }) || "Kore",
    googleApiKey,
    googleChatModel,
    googleSttModel: readString(env, "GOOGLE_STT_MODEL", missing) || googleChatModel,
    googleEmbeddingModel,
    googleEmbeddingDimensions,
    qdrantUrl,
    qdrantApiKey,
    qdrantCollection,
    databaseUrl,
    databaseSsl: readBoolean(env, "DATABASE_SSL", false),
    memoryBackend,
    requestTimeoutMs: readInteger(env, "REQUEST_TIMEOUT_MS", 45000, 5000, 55000, []),
    maxHistoryMessages: readInteger(env, "MAX_HISTORY_MESSAGES", 30, 4, 200, []),
    maxGraphSteps: readInteger(env, "MAX_GRAPH_STEPS", 12, 2, 50, []),
    qdrantTopK: readInteger(env, "QDRANT_TOP_K", 4, 1, 20, []),
    qdrantScoreThreshold: readNumber(env, "QDRANT_SCORE_THRESHOLD", 0.35, 0, 1, []),
    embeddingChunkSize,
    embeddingChunkOverlap,
  };
}

export function inspectConfig(env: NodeJS.ProcessEnv = process.env): ConfigStatus {
  const has = (key: string) => {
    const value = env[key]?.trim();
    return Boolean(value && !isPlaceholder(value));
  };
  return {
    google: has("GOOGLE_API_KEY") && has("GOOGLE_CHAT_MODEL") && has("GOOGLE_EMBEDDING_MODEL"),
    qdrant: has("QDRANT_URL"), // QDRANT_COLLECTION defaults to my_custom_agent_db
    database: has("DATABASE_URL"),
    memoryBackend: env.MEMORY_BACKEND?.trim().toLowerCase() === "memory" ? "memory" : "postgres",
  };
}

export function isConfigComplete(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    loadConfig(env);
    return true;
  } catch {
    return false;
  }
}

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig(process.env);
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = undefined;
}
