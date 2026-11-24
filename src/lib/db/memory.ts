import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import type { AppConfig } from "../config";

interface MemoryState {
  key: string;
  checkpointer: Promise<BaseCheckpointSaver>;
  pool?: Pool;
}

const globalRef = globalThis as typeof globalThis & {
  __novaMemoryState?: MemoryState;
};

function memoryKey(config: AppConfig): string {
  return [config.memoryBackend, config.databaseUrl, config.databaseSsl ? "ssl" : "plain"].join(
    "|",
  );
}

export function getCheckpointer(config: AppConfig): Promise<BaseCheckpointSaver> {
  const key = memoryKey(config);
  const cached = globalRef.__novaMemoryState;
  if (cached && cached.key === key) {
    return cached.checkpointer;
  }

  if (config.memoryBackend === "memory") {
    const checkpointer = Promise.resolve<BaseCheckpointSaver>(new MemorySaver());
    globalRef.__novaMemoryState = { key, checkpointer };
    return checkpointer;
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    ...(config.databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Cache the in-flight promise so concurrent first requests share one pool.
  const checkpointer = (async () => {
    const saver = new PostgresSaver(pool);
    await saver.setup();
    return saver;
  })();
  const state: MemoryState = { key, checkpointer, pool };
  globalRef.__novaMemoryState = state;
  checkpointer.catch(() => {
    if (globalRef.__novaMemoryState === state) globalRef.__novaMemoryState = undefined;
    void pool.end().catch(() => undefined);
  });
  return checkpointer;
}

export async function closeMemoryPool(): Promise<void> {
  const cached = globalRef.__novaMemoryState;
  if (cached?.pool) {
    await cached.pool.end().catch(() => undefined);
  }
  globalRef.__novaMemoryState = undefined;
}
