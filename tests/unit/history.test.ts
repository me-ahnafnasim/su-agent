import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { prepareModelHistory } from "@/lib/ai/history";

const types = (messages: BaseMessage[]) => messages.map((m) => m.getType());

describe("prepareModelHistory", () => {
  it("passes a normal conversation through unchanged", () => {
    const history = [
      new HumanMessage("Open a ticket for my laptop"),
      new AIMessage({ content: "", tool_calls: [{ id: "c1", name: "execute_task", args: {} }] }),
      new ToolMessage({ content: "{}", tool_call_id: "c1" }),
      new AIMessage("Simulated ticket ACT-12345678"),
      new HumanMessage("What was my ticket about?"),
    ];
    expect(prepareModelHistory(history, 30)).toEqual(history);
  });

  it("starts the window on a human turn", () => {
    const history = [
      new HumanMessage("q1"),
      new AIMessage("a1"),
      new HumanMessage("q2"),
      new AIMessage("a2"),
      new HumanMessage("q3"),
    ];
    // Last 4 would start on an AI message; it must advance to q2.
    expect(prepareModelHistory(history, 4).map((m) => m.content)).toEqual(["q2", "a2", "q3"]);
  });

  it("repairs a turn aborted mid-tool-call (dangling call + consecutive human turns)", () => {
    const history = [
      new HumanMessage("Create a ticket"),
      new AIMessage({ content: "", tool_calls: [{ id: "lost", name: "execute_task", args: {} }] }),
      new HumanMessage("Hello again"),
    ];
    const prepared = prepareModelHistory(history, 30);
    expect(types(prepared)).toEqual(["human"]);
    expect(prepared[0].content).toBe("Create a ticket\n\nHello again");
  });

  it("drops orphan tool results", () => {
    const history = [
      new HumanMessage("hi"),
      new ToolMessage({ content: "x", tool_call_id: "orphan" }),
      new AIMessage("hello"),
    ];
    expect(types(prepareModelHistory(history, 30))).toEqual(["human", "ai"]);
  });

  it("handles empty history", () => {
    expect(prepareModelHistory([], 30)).toEqual([]);
  });
});
