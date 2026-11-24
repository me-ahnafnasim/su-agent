import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { AppConfig } from "../config";

export const CONTENT_PAYLOAD_KEY = "content";
export const METADATA_PAYLOAD_KEY = "metadata";
export const SOURCE_FIELD = `${METADATA_PAYLOAD_KEY}.source`;

export class CollectionDimensionError extends Error {
  readonly collection: string;
  readonly expected: number;
  readonly actual: number;

  constructor(collection: string, expected: number, actual: number) {
    super(
      `Qdrant collection "${collection}" has vector size ${actual}, but the configured embedding model produces ${expected}-dimensional vectors. ` +
        `Use a different QDRANT_COLLECTION for the new embedding model, or reindex deliberately. Existing data was not modified.`,
    );
    this.name = "CollectionDimensionError";
    this.collection = collection;
    this.expected = expected;
    this.actual = actual;
  }
}

const clientCache = new Map<string, QdrantClient>();

export function createQdrantClient(config: AppConfig): QdrantClient {
  const key = `${config.qdrantUrl}|${config.qdrantApiKey}`;
  const existing = clientCache.get(key);
  if (existing) return existing;

  const client = new QdrantClient({
    url: config.qdrantUrl,
    ...(config.qdrantApiKey ? { apiKey: config.qdrantApiKey } : {}),
  });
  clientCache.set(key, client);
  return client;
}

export function createVectorStore(
  client: QdrantClient,
  embeddings: EmbeddingsInterface,
  collectionName: string,
): QdrantVectorStore {
  return new QdrantVectorStore(embeddings, {
    client,
    collectionName,
    contentPayloadKey: CONTENT_PAYLOAD_KEY,
    metadataPayloadKey: METADATA_PAYLOAD_KEY,
  });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };
  if (candidate.status === 404 || candidate.response?.status === 404) return true;
  return typeof candidate.message === "string" && /not found|doesn't exist|does not exist/i.test(candidate.message);
}

export async function getCollectionDimension(
  client: QdrantClient,
  collectionName: string,
): Promise<number | null> {
  try {
    const info = await client.getCollection(collectionName);
    const vectors = info.config?.params?.vectors;
    if (!vectors) return null;
    if (typeof (vectors as { size?: unknown }).size === "number") {
      return (vectors as { size: number }).size;
    }
    const named = Object.values(vectors as Record<string, { size?: unknown }>);
    const first = named.find((vector) => typeof vector?.size === "number");
    return first && typeof first.size === "number" ? first.size : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export interface EnsureCollectionResult {
  created: boolean;
  dimension: number;
}

export async function ensureCollection(
  client: QdrantClient,
  collectionName: string,
  dimension: number,
): Promise<EnsureCollectionResult> {
  const existingDimension = await getCollectionDimension(client, collectionName);

  if (existingDimension !== null && existingDimension !== dimension) {
    throw new CollectionDimensionError(collectionName, dimension, existingDimension);
  }

  if (existingDimension === null) {
    await client.createCollection(collectionName, {
      vectors: {
        size: dimension,
        distance: "Cosine",
      },
    });
  }

  // Idempotent. Filtered deletes in pruneStaleSourcePoints need this index when the
  // Qdrant Cloud cluster runs in strict mode (unindexed filtering disabled).
  await client.createPayloadIndex(collectionName, {
    wait: true,
    field_name: SOURCE_FIELD,
    field_schema: "keyword",
  });

  return { created: existingDimension === null, dimension };
}

export interface KnowledgePoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    metadata: Record<string, unknown>;
  };
}

export async function upsertKnowledgePoints(
  client: QdrantClient,
  collectionName: string,
  points: KnowledgePoint[],
): Promise<void> {
  if (points.length === 0) return;
  await client.upsert(collectionName, {
    wait: true,
    points,
  });
}

export async function pruneStaleSourcePoints(
  client: QdrantClient,
  collectionName: string,
  source: string,
  currentIds: string[],
): Promise<void> {
  if (currentIds.length === 0) return;
  await client.delete(collectionName, {
    wait: true,
    filter: {
      must: [{ key: SOURCE_FIELD, match: { value: source } }],
      must_not: [{ has_id: currentIds }],
    },
  });
}
