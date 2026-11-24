import { HumanMessage, type AIMessage, type BaseMessage, type ToolMessage } from "@langchain/core/messages";

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : "",
      )
      .join("");
  }
  return "";
}

function toolCallIds(message: BaseMessage): string[] {
  if (message.getType() !== "ai") return [];
  return ((message as AIMessage).tool_calls ?? [])
    .map((call) => call.id)
    .filter((id): id is string => typeof id === "string");
}

/**
 * Builds the message list sent to Gemini from the persisted thread.
 *
 * Gemini rejects histories that do not start with a user turn, that contain a function
 * call without its response, or that have two consecutive turns from the same author
 * (@langchain/google-genai throws "requires alternate messages between authors").
 * A request aborted mid-turn can persist exactly those shapes, which would otherwise
 * break every later message in that session. This keeps the stored checkpoint intact
 * and only repairs what the model sees.
 */
export function prepareModelHistory(messages: BaseMessage[], maxMessages: number): BaseMessage[] {
  if (messages.length === 0) return [];

  // 1. Window to the last N messages, then start on a human turn.
  let start = Math.max(0, messages.length - Math.max(1, maxMessages));
  while (start < messages.length && messages[start].getType() !== "human") start += 1;
  if (start >= messages.length) {
    // No human message inside the window: fall back to the latest human turn.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].getType() === "human") {
        start = i;
        break;
      }
    }
    if (start >= messages.length) return [];
  }
  const windowed = messages.slice(start);

  // 2. Drop tool calls without responses and tool responses without calls.
  const answered = new Set(
    windowed
      .filter((m) => m.getType() === "tool")
      .map((m) => (m as ToolMessage).tool_call_id),
  );
  const keptAiCalls = new Set<string>();
  const paired = windowed.filter((message) => {
    const ids = toolCallIds(message);
    if (ids.length > 0) {
      if (!ids.every((id) => answered.has(id))) return false;
      ids.forEach((id) => keptAiCalls.add(id));
    }
    return true;
  });
  const consistent = paired.filter(
    (message) =>
      message.getType() !== "tool" || keptAiCalls.has((message as ToolMessage).tool_call_id),
  );

  // 3. Merge consecutive human turns; keep only the last of consecutive plain AI turns.
  const result: BaseMessage[] = [];
  for (const message of consistent) {
    const previous = result[result.length - 1];
    if (previous?.getType() === "human" && message.getType() === "human") {
      result[result.length - 1] = new HumanMessage(
        `${contentToText(previous.content)}\n\n${contentToText(message.content)}`.trim(),
      );
      continue;
    }
    if (
      previous?.getType() === "ai" &&
      message.getType() === "ai" &&
      toolCallIds(previous).length === 0
    ) {
      result[result.length - 1] = message;
      continue;
    }
    result.push(message);
  }
  return result;
}
