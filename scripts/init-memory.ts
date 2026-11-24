import { loadEnvConfig } from "@next/env";
import { loadConfig } from "../src/lib/config";
import { closeMemoryPool, getCheckpointer } from "../src/lib/db/memory";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const config = loadConfig();

  if (config.memoryBackend !== "postgres") {
    console.log("MEMORY_BACKEND=memory — there are no PostgreSQL checkpoint tables to initialize.");
    return;
  }

  await getCheckpointer(config);
  console.log("PostgreSQL checkpoint tables are ready.");

  await closeMemoryPool();
}

main().catch((error: unknown) => {
  console.error(
    "Failed to initialize PostgreSQL memory:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
