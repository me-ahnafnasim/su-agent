import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, parseChatRequest } from "@/lib/validation";

describe("parseChatRequest", () => {
  it("accepts a valid request and trims fields", () => {
    const result = parseChatRequest({ message: "  Hello Nova ", sessionId: "demo-session-001" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe("Hello Nova");
  });

  it.each([
    ["empty message", { message: "   ", sessionId: "s1" }],
    ["missing sessionId", { message: "hi" }],
    ["non-string message", { message: 42, sessionId: "s1" }],
    ["unsafe sessionId", { message: "hi", sessionId: "../etc/passwd" }],
    ["too-long message", { message: "a".repeat(MESSAGE_MAX_LENGTH + 1), sessionId: "s1" }],
    ["too-long sessionId", { message: "hi", sessionId: "a".repeat(129) }],
    ["null body", null],
  ])("rejects %s", (_label, body) => {
    expect(parseChatRequest(body).success).toBe(false);
  });
});
