"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types";

const SESSION_KEY = "su-agent.sessionId";
const WELCOME = "হ্যালো! আমি SU Agent। আপনাকে কীভাবে সাহায্য করতে পারি?";
export const CHAT_ERROR = "দুঃখিত, SU Agent-এর সাথে সংযোগ করা যায়নি। আপনার বার্তাটি আবার পাঠানোর চেষ্টা করুন।";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `demo-${crypto.randomUUID()}`;
  }
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadSessionId(): string {
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (stored && /^[A-Za-z0-9._:-]{1,128}$/.test(stored)) return stored;
    const generated = createSessionId();
    window.localStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return createSessionId(); // storage unavailable: conversation lasts for this page view only
  }
}

/**
 * Conversation state shared by Chat and Talk modes: one sessionId, one transcript,
 * so switching modes keeps Nova's memory and the visible history.
 */
export function useNovaChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef("");
  const pendingRef = useRef(false);
  const nextIdRef = useRef(1);

  useEffect(() => {
    sessionIdRef.current = loadSessionId();
  }, []);

  /** Sends one message. Resolves to Nova's reply, or null on failure (error is set). */
  const send = useCallback(async (raw: string): Promise<string | null> => {
    const text = raw.trim();
    if (!text || pendingRef.current) return null;
    if (!sessionIdRef.current) sessionIdRef.current = loadSessionId();

    pendingRef.current = true;
    setPending(true);
    setError(null);
    const userMessage: ChatMessage = { id: `m${nextIdRef.current++}`, role: "user", content: text };
    setMessages((previous) => [...previous, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
        cache: "no-store",
      });
      const data: unknown = await response.json().catch(() => null);
      const reply =
        data && typeof data === "object" && "reply" in data ? (data as { reply?: unknown }).reply : undefined;
      if (!response.ok || typeof reply !== "string" || !reply.trim()) {
        throw new Error("Chat request failed");
      }
      setMessages((previous) => [
        ...previous,
        { id: `m${nextIdRef.current++}`, role: "assistant", content: reply },
      ]);
      return reply;
    } catch {
      setMessages((previous) => previous.filter((message) => message.id !== userMessage.id));
      setError(CHAT_ERROR);
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { messages, pending, error, send, clearError };
}
