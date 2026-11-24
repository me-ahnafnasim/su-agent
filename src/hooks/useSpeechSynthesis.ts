"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export interface UseSpeechSynthesisOptions {
  lang?: string;
}

export interface UseSpeechSynthesisResult {
  supported: boolean;
  speaking: boolean;
  error: string | null;
  speak: (text: string) => void;
  cancel: () => void;
}

export function useSpeechSynthesis({
  lang = "bn-BD",
}: UseSpeechSynthesisOptions = {}): UseSpeechSynthesisResult {
  // false on the server and during hydration, the real value on the client.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setError("Voice output is not supported in this browser");
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang;

      const voices = synth.getVoices();
      const banglaVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith("bn"));
      if (banglaVoice) utterance.voice = banglaVoice;
      const missingVoiceNotice =
        voices.length === 0
          ? "এই ব্রাউজারে কোনো টেক্সট-টু-স্পিচ ভয়েস পাওয়া যায়নি, তাই উত্তর শোনানো নাও যেতে পারে। (Linux: speech-dispatcher / espeak-ng ইনস্টল করুন)"
          : !banglaVoice
            ? "এই ডিভাইসে বাংলা ভয়েস ইনস্টল করা নেই; ব্রাউজারের ডিফল্ট ভয়েসে পড়া হচ্ছে।"
            : null;

      utterance.onstart = () => {
        setError(missingVoiceNotice);
        setSpeaking(true);
      };
      utterance.onend = () => {
        setSpeaking(false);
      };
      utterance.onerror = (event) => {
        setSpeaking(false);
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setError(
            "ভয়েস আউটপুট চালু করা যায়নি। ব্রাউজার বা ডিভাইসের সেটিংস দেখুন।",
          );
        }
      };

      setError(missingVoiceNotice);
      synth.speak(utterance);
    },
    [lang],
  );

  return { supported, speaking, error, speak, cancel };
}
