"use client";

import { AlertCircle, Info, Mic, MicOff, Square } from "lucide-react";
import type { ChatMessage } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import RichText from "./RichText";
import VoiceAvatar, { type AvatarState } from "./VoiceAvatar";

interface TalkModeProps {
  messages: ChatMessage[];
  avatarState: AvatarState;
  getLevel: () => number;
  pending: boolean;
  listening: boolean;
  micSupported: boolean;
  voiceSource: "natural" | "browser" | null;
  notice: string | null;
  error: string | null;
  onTalk: () => void;
  onStopSpeaking: () => void;
}

const STATUS: Record<AvatarState, string> = {
  idle: "কথা বলতে নিচের বোতামে ট্যাপ করুন",
  listening: "শুনছি… কথা শেষ হলে আমি উত্তর দেব",
  thinking: "ভাবছি…",
  speaking: "বলছি…",
};

const STATE_DOT: Record<AvatarState, string> = {
  idle: "bg-muted-foreground/40",
  listening: "bg-red-500 animate-pulse",
  thinking: "bg-amber-500 animate-pulse",
  speaking: "bg-emerald-500 animate-pulse",
};

export default function TalkMode({
  messages,
  avatarState,
  getLevel,
  pending,
  listening,
  micSupported,
  voiceSource,
  notice,
  error,
  onTalk,
  onStopSpeaking,
}: TalkModeProps) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastNova = [...messages].reverse().find((m) => m.role === "assistant");
  const speaking = avatarState === "speaking";


  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
      <Card className="items-center gap-4 py-8">
        <CardContent className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={speaking ? onStopSpeaking : onTalk}
            disabled={pending}
            className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-wait"
            aria-label={speaking ? "SU Agent-কে থামান" : "কথা বলুন"}
          >
            <VoiceAvatar state={avatarState} getLevel={getLevel} size={208} />
          </button>

          <div className="flex flex-col items-center gap-2">
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-sm font-normal" aria-live="polite">
              <span className={cn("size-2 rounded-full", STATE_DOT[avatarState])} aria-hidden="true" />
              {STATUS[avatarState]}
            </Badge>
            {voiceSource && (
              <span className="text-xs text-muted-foreground">
                {voiceSource === "natural" ? "প্রাকৃতিক এআই ভয়েস" : "ব্রাউজারের ভয়েস"}
              </span>
            )}
          </div>

          <Button
            size="lg"
            variant={listening ? "destructive" : speaking ? "secondary" : "default"}
            onClick={speaking ? onStopSpeaking : onTalk}
            disabled={pending || (!micSupported && !speaking)}
            className="min-w-44 rounded-full"
          >
            {speaking ? <Square /> : listening ? <MicOff /> : <Mic />}
            {speaking ? "থামান" : listening ? "শোনা বন্ধ করুন" : "কথা বলুন"}
          </Button>
          {!micSupported && (
            <p className="max-w-sm text-center text-xs text-muted-foreground">
              Voice input is not supported in this browser — এখানে ভয়েস ইনপুট সমর্থিত নয়, চ্যাট মোড ব্যবহার করুন।
            </p>
          )}
        </CardContent>
      </Card>

      {(lastUser || lastNova) && (
        <div className="space-y-2" aria-label="সর্বশেষ কথোপকথন">
          {lastUser && (
            <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {lastUser.content}
            </p>
          )}
          {lastNova && (
            <RichText text={lastNova.content} className="max-h-40 w-fit max-w-[85%] overflow-y-auto rounded-lg rounded-bl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed" />
          )}
        </div>
      )}

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
    </div>
  );
}
