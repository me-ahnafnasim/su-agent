"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, FlaskConical, Info } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import MessageInput from "./MessageInput";
import NovaMark from "./NovaMark";
import RichText from "./RichText";

export function isSimulatedReply(content: string): boolean {
  return /ACT-[A-Z0-9]{8}\b/.test(content) || /simulated/i.test(content) || content.includes("সিমুলেটেড");
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-3">
      <NovaMark className="size-8" />
      <div className="rounded-lg rounded-bl-sm bg-muted px-4 py-3">
        <span className="sr-only">SU Agent উত্তর লিখছে</span>
        <span aria-hidden="true" className="flex items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
        </span>
      </div>
    </div>
  );
}

interface ChatBoxProps {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  notice: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  micListening: boolean;
  micSupported: boolean;
  onMicToggle: () => void;
}

export default function ChatBox({
  messages,
  pending,
  error,
  notice,
  input,
  onInputChange,
  onSend,
  micListening,
  micSupported,
  onMicToggle,
}: ChatBoxProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
      <section aria-label="কথোপকথন" aria-live="polite" className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const simulated = !isUser && isSimulatedReply(message.content);
          return (
            <div key={message.id} className={cn("flex items-end gap-3", isUser && "justify-end")}>
              {!isUser && <NovaMark className="size-8" />}
              <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser && "items-end")}>
                {!isUser && (
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    SU Agent
                    {simulated && (
                      <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900">
                        <FlaskConical />
                        Simulated task
                      </Badge>
                    )}
                  </div>
                )}
                {isUser ? (
                  <p className="rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-primary-foreground">
                    {message.content}
                  </p>
                ) : (
                  <RichText
                    text={message.content}
                    className="rounded-lg rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed text-foreground/90"
                  />
                )}
              </div>
            </div>
          );
        })}
        {pending && <TypingBubble />}
        <div ref={bottomRef} />
      </section>

      <div className="space-y-2 border-t bg-background/80 p-3 backdrop-blur sm:p-4">
        {notice && (
          <Alert role="status">
            <Info />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <MessageInput
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          pending={pending}
          micListening={micListening}
          micSupported={micSupported}
          onMicToggle={onMicToggle}
        />
        <p className="hidden text-center text-xs text-muted-foreground sm:block">
          SU Agent ভুল করতে পারে। গুরুত্বপূর্ণ তথ্য যাচাই করুন।
        </p>
      </div>
    </div>
  );
}
