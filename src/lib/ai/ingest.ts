import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config";
import { createEmbeddings } from "./embeddings";
import {
  ensureCollection,
  pruneStaleSourcePoints,
  upsertKnowledgePoints,
  createQdrantClient,
} from "../db/qdrant";

/** Every UTF-8 .txt file in data/ is a knowledge document; its first non-empty line is its title. */
export function titleFromContent(file: string, content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim();
  return firstLine && firstLine.length <= 200 ? firstLine : file;
}

export interface SourceDocument {
  source: string;
  title: string;
  content: string;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  metadata: {
    source: string;
    title: string;
    chunkIndex: number;
    chunkCount: number;
  };
}

export interface IngestSummary {
  documents: number;
  chunks: number;
  collection: string;
  embeddingModel: string;
  dimension: number;
  collectionCreated: boolean;
  perSource: Array<{ source: string; chunks: number }>;
}

export interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

function splitLongBlock(block: string, chunkSize: number): string[] {
  if (block.length <= chunkSize) return [block];
  const pieces: string[] = [];
  let start = 0;
  while (start < block.length) {
    const end = Math.min(start + chunkSize, block.length);
    pieces.push(block.slice(start, end));
    if (end >= block.length) break;
    start = Math.max(end - Math.floor(chunkSize / 4), start + 1);
  }
  return pieces;
}

export function chunkText(text: string, options: ChunkOptions): string[] {
  const chunkSize = Math.max(50, Math.floor(options.chunkSize));
  const overlap = Math.min(Math.max(0, Math.floor(options.overlap)), chunkSize - 1);
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitLongBlock(block, chunkSize));

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      const withOverlap = `${tail}\n\n${block}`;
      current = withOverlap.length <= chunkSize ? withOverlap : block;
    } else {
      chunks.push(block);
      current = "";
    }
  }

  if (current) chunks.push(current);

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export function createPointId(source: string, chunkIndex: number): string {
  const hash = createHash("sha256").update(`${source}:${chunkIndex}`).digest("hex");
  const variant = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

export async function loadSourceDocuments(
  dataDir: string = path.join(process.cwd(), "data"),
): Promise<SourceDocument[]> {
  const files = (await readdir(dataDir)).filter((file) => file.endsWith(".txt")).sort();
  const documents: SourceDocument[] = [];
  for (const file of files) {
    const content = await readFile(path.join(dataDir, file), "utf8");
    if (!content.trim()) continue;
    documents.push({ source: file, title: titleFromContent(file, content), content });
  }
  return documents;
}

export function buildChunks(documents: SourceDocument[], options: ChunkOptions): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  for (const document of documents) {
    const pieces = chunkText(document.content, options);
    pieces.forEach((text, chunkIndex) => {
      chunks.push({
        id: createPointId(document.source, chunkIndex),
        text,
        metadata: {
          source: document.source,
          title: document.title,
          chunkIndex,
          chunkCount: pieces.length,
        },
      });
    });
  }

  return chunks;
}

export async function ingestKnowledge(
  config: AppConfig,
  options: { dataDir?: string } = {},
): Promise<IngestSummary> {
  const documents = await loadSourceDocuments(options.dataDir);
  const chunks = buildChunks(documents, {
    chunkSize: config.embeddingChunkSize,
    overlap: config.embeddingChunkOverlap,
  });

  if (chunks.length === 0) {
    throw new Error("No knowledge chunks were produced from the fixture documents.");
  }

  const embeddings = createEmbeddings(config, "document");
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.text));

  if (vectors.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: produced ${vectors.length} vectors for ${chunks.length} chunks.`,
    );
  }

  const dimension = vectors[0]?.length ?? 0;
  if (dimension === 0) {
    throw new Error("The embedding model returned an empty vector.");
  }
  const inconsistent = vectors.find((vector) => vector.length !== dimension);
  if (inconsistent) {
    throw new Error(
      `Inconsistent embedding dimensions: expected ${dimension}, received ${inconsistent.length}.`,
    );
  }

  const client = createQdrantClient(config);
  const collection = await ensureCollection(client, config.qdrantCollection, dimension);

  await upsertKnowledgePoints(
    client,
    config.qdrantCollection,
    chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: vectors[index],
      payload: {
        content: chunk.text,
        metadata: chunk.metadata,
      },
    })),
  );

  for (const document of documents) {
    const ids = chunks
      .filter((chunk) => chunk.metadata.source === document.source)
      .map((chunk) => chunk.id);
    await pruneStaleSourcePoints(client, config.qdrantCollection, document.source, ids);
  }

  return {
    documents: documents.length,
    chunks: chunks.length,
    collection: config.qdrantCollection,
    embeddingModel: config.googleEmbeddingModel,
    dimension,
    collectionCreated: collection.created,
    perSource: documents.map((document) => ({
      source: document.source,
      chunks: chunks.filter((chunk) => chunk.metadata.source === document.source).length,
    })),
  };
}
