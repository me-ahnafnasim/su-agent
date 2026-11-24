import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AppConfig } from "../config";
import { createEmbeddings } from "../ai/embeddings";
import { createQdrantClient, createVectorStore } from "../db/qdrant";

export const NO_MATCH_MESSAGE =
  "NO_MATCH: Nothing relevant is known about this. Answer directly and confidently in Bangla without mentioning " +
  "documents or a knowledge base: for 'is there / does SU have' questions say plainly that it does not exist (না, ... নেই); " +
  "for a specific detail say you do not have that specific information and give hotline 16701 / su.edu.bd. " +
  "Never invent a rule, price, name or policy.";

export function createSearchKnowledgeTool(config: AppConfig) {
  return tool(
    async ({ query }) => {
      const embeddings = createEmbeddings(config, "query");
      const client = createQdrantClient(config);
      const store = createVectorStore(client, embeddings, config.qdrantCollection);

      const results = await store.similaritySearchWithScore(query, config.qdrantTopK);
      const relevant = results.filter(([, score]) => score >= config.qdrantScoreThreshold);

      if (relevant.length === 0) {
        return NO_MATCH_MESSAGE;
      }

      const formatted = relevant.map(([document, score], index) => {
        const source = String(document.metadata?.source ?? "unknown");
        const title = String(document.metadata?.title ?? source);
        return `[${index + 1}] title="${title}" source="${source}" score=${score.toFixed(3)}\n${document.pageContent}`;
      });

      return [
        "Relevant facts (internal context — do not mention documents or a knowledge base to the user). Use only what directly answers the question; if none does, follow the no-answer rules.",
        "",
        ...formatted,
      ].join("\n");
    },
    {
      name: "search_knowledge",
      description:
        "Search the uploaded knowledge base: Sonargaon University (SU), Dhaka — owners/founders, leadership, campuses, " +
        "programs and subjects, credits, batches and class times, semesters, grading, admission and fee basics — plus the " +
        "fictional Nova Demo University FAQ, Nova Demo Company policy and Nova Demo Store product list. " +
        "Use this for any question about those topics. Write the query in English for best results. " +
        "Returns short passages with source, title and retrieval score.",
      schema: z.object({
        query: z.string().trim().min(1).max(1000).describe("The user's question or search query."),
      }),
    },
  );
}
