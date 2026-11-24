import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import type { AppConfig } from "../config";

type EmbeddingTaskType = NonNullable<
  ConstructorParameters<typeof GoogleGenerativeAIEmbeddings>[0]
>["taskType"];

/** "document" for ingestion, "query" for search. Same model => same vector dimension. */
export type EmbeddingPurpose = "document" | "query";

const TASK_TYPES: Record<EmbeddingPurpose, EmbeddingTaskType> = {
  document: "RETRIEVAL_DOCUMENT" as EmbeddingTaskType,
  query: "RETRIEVAL_QUERY" as EmbeddingTaskType,
};

const cache = new Map<string, GoogleGenerativeAIEmbeddings>();

export function createEmbeddings(
  config: AppConfig,
  purpose: EmbeddingPurpose = "query",
): GoogleGenerativeAIEmbeddings {
  const key = [
    config.googleApiKey,
    config.googleEmbeddingModel,
    config.googleEmbeddingDimensions ?? "default",
    purpose,
  ].join("|");

  const existing = cache.get(key);
  if (existing) return existing;

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: config.googleApiKey,
    model: config.googleEmbeddingModel,
    taskType: TASK_TYPES[purpose],
    ...(config.googleEmbeddingDimensions
      ? { outputDimensionality: config.googleEmbeddingDimensions }
      : {}),
  });

  cache.set(key, embeddings);
  return embeddings;
}
