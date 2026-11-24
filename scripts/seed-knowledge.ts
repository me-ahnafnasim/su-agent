import { loadEnvConfig } from "@next/env";
import { loadConfig } from "../src/lib/config";
import { ingestKnowledge } from "../src/lib/ai/ingest";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const config = loadConfig();
  const summary = await ingestKnowledge(config);

  console.log("");
  console.log("Nova knowledge ingestion complete");
  console.log(`  Documents:       ${summary.documents}`);
  console.log(`  Chunks:          ${summary.chunks}`);
  console.log(`  Collection:      ${summary.collection} (${summary.collectionCreated ? "created" : "existing"})`);
  console.log(`  Embedding model: ${summary.embeddingModel}`);
  console.log(`  Vector size:     ${summary.dimension}`);
  console.log("  Per source:");
  for (const source of summary.perSource) {
    console.log(`    - ${source.source}: ${source.chunks} chunk(s)`);
  }
  console.log("");
}

main().catch((error: unknown) => {
  console.error(
    "Knowledge ingestion failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
