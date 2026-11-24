"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechSynthesis } from "./useSpeechSynthesis";

export type VoiceSource = "natural" | "browser";

// After the server says natural voice is unavailable, skip it for a while instead of
// adding a failing round-trip before every reply.
const NATURAL_RETRY_MS = 5 * 60_000;

/**
 * Nova's voice: natural Gemini TTS from /api/tts, falling back to the browser's
 * speechSynthesis. getLevel() returns the current loudness (0..1) for the avatar animation.
 */
export function useNovaVoice() {
  const browser = useSpeechSynthesis({ lang: "bn-BD" });
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<VoiceSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const naturalBlockedUntilRef = useRef(0);
  const tokenRef = useRef(0);

  const releaseAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const { cancel: cancelBrowser, speak: speakBrowser } = browser;

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    releaseAudio();
    cancelBrowser();
    setPreparing(false);
    setPlaying(false);
  }, [cancelBrowser, releaseAudio]);

  useEffect(() => () => {
    abortRef.current?.abort();
    releaseAudio();
    void ctxRef.current?.close().catch(() => undefined);
  }, [releaseAudio]);

  const fallbackToBrowser = useCallback(
    (text: string) => {
      setSource("browser");
      speakBrowser(text);
    },
    [speakBrowser],
  );

  const speak = useCallback(
    async (text: string) => {
      cancel();
      const token = tokenRef.current;
      setNotice(null);

      if (Date.now() < naturalBlockedUntilRef.current) {
        fallbackToBrowser(text);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setPreparing(true);
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 503) naturalBlockedUntilRef.current = Date.now() + NATURAL_RETRY_MS;
          throw new Error(`tts ${response.status}`);
        }
        const blob = await response.blob();
        if (token !== tokenRef.current) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        urlRef.current = url;
        audioRef.current = audio;

        // Route through an analyser so the avatar can follow the real loudness.
        try {
          const ctx = ctxRef.current ?? new AudioContext();
          ctxRef.current = ctx;
          if (ctx.state === "suspended") await ctx.resume();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaElementSource(audio).connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;
          bufferRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        } catch {
          analyserRef.current = null; // audio still plays; animation uses a synthetic level
        }

        audio.onplay = () => setPlaying(true);
        audio.onended = () => {
          setPlaying(false);
          analyserRef.current = null;
          releaseAudio();
        };
        audio.onerror = () => {
          setPlaying(false);
          if (token === tokenRef.current) fallbackToBrowser(text);
        };

        setSource("natural");
        setPreparing(false);
        await audio.play();
      } catch (error) {
        if (token !== tokenRef.current || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setPreparing(false);
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setNotice("ব্রাউজার স্বয়ংক্রিয় অডিও আটকে দিয়েছে। পৃষ্ঠায় একবার ট্যাপ করে আবার চেষ্টা করুন।");
          return;
        }
        fallbackToBrowser(text);
      }
    },
    [cancel, fallbackToBrowser, releaseAudio],
  );

  const speaking = playing || browser.speaking;

  /** Loudness 0..1 — real for natural voice, synthetic for the browser voice. */
  const getLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    if (analyser && buffer && audioRef.current && !audioRef.current.paused) {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
    }
    if (browser.speaking) {
      const t = performance.now() / 1000;
      return 0.35 + 0.25 * Math.sin(t * 9) * Math.sin(t * 2.3) + 0.1 * Math.random();
    }
    return 0;
  }, [browser.speaking]);

  return {
    speak,
    cancel,
    speaking,
    preparing,
    source,
    getLevel,
    notice: notice ?? browser.error,
  };
}
