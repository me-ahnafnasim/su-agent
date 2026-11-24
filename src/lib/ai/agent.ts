import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { AppConfig } from "../config";
import { getCheckpointer } from "../db/memory";
import { createHash } from "node:crypto";
import { NOVA_SYSTEM_PROMPT } from "./prompts";
import { prepareModelHistory } from "./history";
import { createSearchKnowledgeTool } from "../tools/searchKnowledge";
import { createExecuteTaskTool } from "../tools/executeTask";

type NovaGraph = ReturnType<typeof createReactAgent>;

interface GraphState {
  key: string;
  graph: Promise<NovaGraph>;
}

const globalRef = globalThis as typeof globalThis & {
  __novaGraphState?: GraphState;
};

export class EmptyAgentReplyError extends Error {
  constructor() {
    super("The agent returned no text reply.");
    this.name = "EmptyAgentReplyError";
  }
}

function graphKey(config: AppConfig): string {
  return [
    config.googleApiKey,
    config.googleChatModel,
    config.googleEmbeddingModel,
    config.qdrantUrl,
    config.qdrantCollection,
    config.qdrantTopK,
    config.qdrantScoreThreshold,
    config.memoryBackend,
    config.databaseUrl,
    config.maxHistoryMessages,
    // Rebuild the cached graph when the prompt changes (e.g. after a rename), even without a restart.
    createHash("sha256").update(NOVA_SYSTEM_PROMPT).digest("hex").slice(0, 12),
  ].join("|");
}

export function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function extractReply(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.getType() !== "ai") continue;
    const text = messageContentToText(message.content);
    if (text) return text;
  }
  throw new EmptyAgentReplyError();
}

export function getNovaGraph(config: AppConfig): Promise<NovaGraph> {
  const key = graphKey(config);
  const cached = globalRef.__novaGraphState;
  if (cached && cached.key === key) {
    return cached.graph;
  }

  // Cache the in-flight promise so concurrent first requests share one graph/pool.
  const graph = buildGraph(config);
  globalRef.__novaGraphState = { key, graph };
  graph.catch(() => {
    if (globalRef.__novaGraphState?.graph === graph) globalRef.__novaGraphState = undefined;
  });
  return graph;
}

async function buildGraph(config: AppConfig): Promise<NovaGraph> {
  const checkpointer = await getCheckpointer(config);

  const llm = new ChatGoogleGenerativeAI({
    apiKey: config.googleApiKey,
    model: config.googleChatModel,
    temperature: 0.2,
    maxOutputTokens: 2048,
  });

  const maxHistory = config.maxHistoryMessages;

  return createReactAgent({
    llm,
    tools: [createSearchKnowledgeTool(config), createExecuteTaskTool()],
    prompt: NOVA_SYSTEM_PROMPT,
    checkpointer,
    name: "nova",
    preModelHook: async (state: { messages?: BaseMessage[] }) => ({
      llmInputMessages: prepareModelHistory(state.messages ?? [], maxHistory),
    }),
  });
}

export interface RunAgentInput {
  message: string;
  sessionId: string;
}

export interface RunAgentOptions {
  signal?: AbortSignal;
}

export async function runAgent(
  input: RunAgentInput,
  config: AppConfig,
  options: RunAgentOptions = {},
): Promise<string> {
  const graph = await getNovaGraph(config);

  const result = (await graph.invoke(
    { messages: [new HumanMessage(input.message)] },
    {
      configurable: { thread_id: input.sessionId },
      recursionLimit: config.maxGraphSteps,
      metadata: { sessionId: input.sessionId },
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )) as { messages?: BaseMessage[] };

  return extractReply(result.messages ?? []);
}

export function resetAgentCache(): void {
  globalRef.__novaGraphState = undefined;
}
