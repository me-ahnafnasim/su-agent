"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { blobToWav } from "@/lib/audio/wav";

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

type Engine = "browser" | "recorder";

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Brave exposes SpeechRecognition but has no speech service behind it (always "network"
 * error), so it goes straight to recording + server transcription.
 */
function preferredEngine(): Engine | null {
  const isBrave = typeof navigator !== "undefined" && "brave" in navigator;
  if (getRecognitionCtor() && !isBrave) return "browser";
  if (canRecord()) return "recorder";
  return getRecognitionCtor() ? "browser" : null;
}

const noopSubscribe = () => () => {};

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "মাইক্রোফোনের অনুমতি দেওয়া হয়নি। ব্রাউজারের ঠিকানা-বারের পাশে মাইক্রোফোনের অনুমতি দিন।",
  "service-not-allowed": "এই ব্রাউজারে ভয়েস ইনপুট অনুমোদিত নয়।",
  "audio-capture": "কোনো মাইক্রোফোন পাওয়া যায়নি।",
  "no-speech": "কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।",
  "language-not-supported": "এই ব্রাউজারে বাংলা ভয়েস ইনপুট সমর্থিত নয়।",
  transcribe: "আপনার কথা লেখায় রূপান্তর করা যায়নি। আবার চেষ্টা করুন।",
};

// Voice-activity detection for the recorder: stop after this much silence once speech began.
const SPEECH_RMS = 0.03;
const SILENCE_MS = 1300;
const NO_SPEECH_MS = 7000;
const MAX_RECORDING_MS = 30000;

export function useSpeechRecognition(onTranscript: (text: string) => void, lang = "bn-BD") {
  // false on the server and during hydration, the real value on the client.
  const supported = useSyncExternalStore(noopSubscribe, () => preferredEngine() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      cleanupRef.current?.();
    },
    [],
  );

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const wav = await blobToWav(blob);
      const response = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });
      const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
      if (!response.ok || typeof data?.text !== "string") throw new Error("stt failed");
      const text = data.text.trim();
      if (text) onTranscriptRef.current(text);
      else setError(ERROR_MESSAGES["no-speech"]);
    } catch {
      setError(ERROR_MESSAGES.transcribe);
    } finally {
      setTranscribing(false);
    }
  }, []);

  const startRecorder = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? ERROR_MESSAGES["not-allowed"]
          : name === "NotFoundError"
            ? ERROR_MESSAGES["audio-capture"]
            : "মাইক্রোফোন চালু করা যায়নি।",
      );
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    const startedAt = performance.now();
    let heardSpeech = false;
    let lastVoiceAt = startedAt;
    let frame = 0;

    const cleanup = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close().catch(() => undefined);
      cleanupRef.current = null;
    };
    cleanupRef.current = () => {
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
    };

    const watch = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      const now = performance.now();
      if (Math.sqrt(sum / samples.length) > SPEECH_RMS) {
        heardSpeech = true;
        lastVoiceAt = now;
      }
      const silentTooLong = heardSpeech && now - lastVoiceAt > SILENCE_MS;
      const nothingSaid = !heardSpeech && now - startedAt > NO_SPEECH_MS;
      if (silentTooLong || nothingSaid || now - startedAt > MAX_RECORDING_MS) {
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      frame = requestAnimationFrame(watch);
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      cleanup();
      recorderRef.current = null;
      setListening(false);
      if (!heardSpeech) {
        setError(ERROR_MESSAGES["no-speech"]);
        return;
      }
      void transcribe(new Blob(chunks, { type: recorder.mimeType }));
    };

    recorderRef.current = recorder;
    recorder.start();
    setListening(true);
    frame = requestAnimationFrame(watch);
  }, [transcribe]);

  const startBrowser = useCallback(
    (Ctor: RecognitionCtor) => {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (transcript) onTranscriptRef.current(transcript);
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted") return;
        if ((event.error === "network" || event.error === "service-not-allowed") && canRecord()) {
          // The browser has no working speech service: use recording + server transcription.
          engineRef.current = "recorder";
          setError("এই ব্রাউজারের ভয়েস সেবা কাজ করছে না — বিকল্প পদ্ধতি চালু হয়েছে। আবার ট্যাপ করে বলুন।");
          return;
        }
        setError(ERROR_MESSAGES[event.error] ?? `ভয়েস ইনপুট ত্রুটি: ${event.error}`);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        recognitionRef.current = null;
        setError("ভয়েস ইনপুট শুরু করা যায়নি।");
      }
    },
    [lang],
  );

  const start = useCallback(() => {
    if (recognitionRef.current || recorderRef.current || transcribing) return;
    setError(null);
    const engine = engineRef.current ?? preferredEngine();
    engineRef.current = engine;
    const Ctor = getRecognitionCtor();
    if (engine === "browser" && Ctor) {
      startBrowser(Ctor);
    } else if (engine === "recorder") {
      void startRecorder();
    } else {
      setError("Voice input is not supported in this browser");
    }
  }, [startBrowser, startRecorder, transcribing]);

  /** Stop listening now; a recording made so far is still transcribed. */
  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }, []);

  return { supported, listening, transcribing, error, start, stop };
}
