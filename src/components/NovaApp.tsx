"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNovaChat } from "@/hooks/useNovaChat";
import { useNovaVoice } from "@/hooks/useNovaVoice";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { AudioLines, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChatBox from "./ChatBox";
import NovaMark from "./NovaMark";
import TalkMode from "./TalkMode";
import VoiceToggle from "./VoiceToggle";
import type { AvatarState } from "./VoiceAvatar";

type Mode = "chat" | "talk";

const VOICE_KEY = "nova.voiceEnabled";
const MODE_KEY = "nova.mode";

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable — preference lasts for this page view only
  }
}

/**
 * Two modes over one conversation (same sessionId and transcript):
 *  - Chat: typed chat; replies are spoken only when Voice is ON.
 *  - Talk: voice conversation; speech is sent automatically when you stop talking
 *    (intentional auto-send), and every reply is spoken with an animated Nova.
 */
export default function NovaApp() {
  const chat = useNovaChat();
  const voice = useNovaVoice();
  const [mode, setMode] = useState<Mode>("chat");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [input, setInput] = useState("");
  const modeRef = useRef<Mode>("chat");
  const voiceEnabledRef = useRef(false);

  useEffect(() => {
    // Restore client-only preferences after hydration.
    const storedMode = readPref(MODE_KEY) === "talk" ? "talk" : "chat";
    const storedVoice = readPref(VOICE_KEY) === "true";
    modeRef.current = storedMode;
    voiceEnabledRef.current = storedVoice;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage
    setMode(storedMode);
    setVoiceEnabled(storedVoice);
  }, []);

  const { send } = chat;
  const { speak, cancel } = voice;

  const sendAndMaybeSpeak = useCallback(
    async (text: string, forceSpeak: boolean) => {
      const reply = await send(text);
      if (reply && (forceSpeak || voiceEnabledRef.current)) void speak(reply);
      return reply;
    },
    [send, speak],
  );

  // One recogniser for both modes: Chat fills the input, Talk sends immediately.
  const handleTranscript = useCallback(
    (text: string) => {
      if (modeRef.current === "talk") {
        void sendAndMaybeSpeak(text, true);
      } else {
        setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text));
      }
    },
    [sendAndMaybeSpeak],
  );
  const stt = useSpeechRecognition(handleTranscript, "bn-BD");

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    stt.stop();
    cancel();
    chat.clearError();
    modeRef.current = next;
    setMode(next);
    writePref(MODE_KEY, next);
  };

  const toggleVoice = (enabled: boolean) => {
    voiceEnabledRef.current = enabled;
    setVoiceEnabled(enabled);
    writePref(VOICE_KEY, String(enabled));
    if (!enabled) cancel();
  };

  const toggleMic = () => {
    if (stt.listening) {
      stt.stop();
      return;
    }
    cancel(); // don't record Nova's own voice
    stt.start();
  };

  const sendTyped = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const reply = await sendAndMaybeSpeak(text, false);
    if (!reply) setInput((current) => current || text); // keep unsent text on failure
  };

  const avatarState: AvatarState = stt.listening
    ? "listening"
    : stt.transcribing || chat.pending || voice.preparing
      ? "thinking"
      : voice.speaking
        ? "speaking"
        : "idle";

  const notice = stt.error ?? (mode === "talk" || voiceEnabled ? voice.notice : null);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <NovaMark className="size-10" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight">SU Agent</h1>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  Online
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">সোনারগাঁও বিশ্ববিদ্যালয়ের বাংলা এআই সহকারী</p>
            </div>
          </div>
          {mode === "chat" && <VoiceToggle enabled={voiceEnabled} supported onChange={toggleVoice} />}
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-3">
          <Tabs value={mode} onValueChange={(value) => switchMode(value as Mode)}>
            <TabsList aria-label="মোড" className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">
                <MessageSquare />
                চ্যাট
              </TabsTrigger>
              <TabsTrigger value="talk">
                <AudioLines />
                কথা বলুন
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {mode === "chat" ? (
        <ChatBox
          messages={chat.messages}
          pending={chat.pending}
          error={chat.error}
          notice={notice}
          input={input}
          onInputChange={setInput}
          onSend={sendTyped}
          micListening={stt.listening}
          micSupported={stt.supported === true}
          onMicToggle={toggleMic}
        />
      ) : (
        <TalkMode
          messages={chat.messages}
          avatarState={avatarState}
          getLevel={voice.getLevel}
          pending={chat.pending}
          listening={stt.listening}
          micSupported={stt.supported === true}
          voiceSource={voice.source}
          notice={notice}
          error={chat.error}
          onTalk={toggleMic}
          onStopSpeaking={cancel}
          onSendText={(text) => void sendAndMaybeSpeak(text, true)}
        />
      )}
    </div>
  );
}
