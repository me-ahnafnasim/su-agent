"use client";

import type { KeyboardEvent } from "react";
import { Loader2, Mic, MicOff, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  micListening: boolean;
  micSupported: boolean;
  onMicToggle: () => void;
}

export default function MessageInput({
  value,
  onChange,
  onSend,
  pending,
  micListening,
  micSupported,
  onMicToggle,
}: MessageInputProps) {
  const canSend = value.trim().length > 0 && !pending;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a newline; ignore while a Bangla IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  const micLabel = !micSupported
    ? "Voice input is not supported in this browser"
    : micListening
      ? "শোনা বন্ধ করুন"
      : "মাইক্রোফোন দিয়ে বলুন";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
      className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50"
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="আপনার বার্তা লিখুন…"
        aria-label="বার্তা"
        maxLength={4000}
        rows={1}
        className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={micListening ? "destructive" : "outline"}
            size="icon"
            onClick={onMicToggle}
            disabled={pending}
            aria-label={micLabel}
            aria-pressed={micListening}
            className={micListening ? "animate-pulse" : undefined}
          >
            {micListening ? <MicOff /> : <Mic />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{micLabel}</TooltipContent>
      </Tooltip>
      <Button type="submit" disabled={!canSend} aria-label="বার্তা পাঠান" aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        <span className="hidden sm:inline">{pending ? "পাঠানো হচ্ছে…" : "পাঠান"}</span>
      </Button>
    </form>
  );
}
