"use client";

import { useEffect, useRef } from "react";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface VoiceAvatarProps {
  state: AvatarState;
  /** Returns current voice loudness 0..1 (read every animation frame, no re-renders). */
  getLevel: () => number;
  size?: number;
}

const LABELS: Record<AvatarState, string> = {
  idle: "SU Agent প্রস্তুত",
  listening: "SU Agent শুনছে",
  thinking: "SU Agent ভাবছে",
  speaking: "SU Agent কথা বলছে",
};

/**
 * Nova's talking avatar (original SVG character).
 * - Mouth lip-syncs to the real voice loudness.
 * - Eyes blink naturally; head bobs while speaking; eyes glance up while thinking.
 */
export default function VoiceAvatar({ state, getLevel, size = 220 }: VoiceAvatarProps) {
  const mouthRef = useRef<SVGEllipseElement>(null);
  const teethRef = useRef<SVGRectElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const getLevelRef = useRef(getLevel);
  const stateRef = useRef(state);

  useEffect(() => {
    getLevelRef.current = getLevel;
  }, [getLevel]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // One animation loop for lip-sync, blinking, head motion and gaze.
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let smoothed = 0;
    let nextBlink = performance.now() + 1500 + Math.random() * 2500;
    let blinkStart = -1;

    const tick = (now: number) => {
      const current = stateRef.current;
      const level = current === "speaking" ? getLevelRef.current() : 0;
      smoothed = smoothed * 0.55 + level * 0.45;

      // Mouth: closed smile at rest, opens with loudness while speaking.
      const open = current === "speaking" ? Math.min(1, smoothed * 1.4) : 0;
      mouthRef.current?.setAttribute("ry", String(1.5 + open * 13));
      mouthRef.current?.setAttribute("rx", String(13 - open * 3));
      teethRef.current?.setAttribute("opacity", String(open > 0.25 ? 0.9 : 0));

      // Blink every few seconds (≈150 ms close/open).
      if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
      let eyeScale = 1;
      if (blinkStart >= 0) {
        const t = (now - blinkStart) / 150;
        eyeScale = t < 1 ? 1 - t : t < 2 ? t - 1 : 1;
        if (t >= 2) {
          blinkStart = -1;
          nextBlink = now + 2500 + Math.random() * 3000;
        }
      }
      eyesRef.current?.setAttribute("transform", `translate(0 ${88 * (1 - eyeScale)}) scale(1 ${Math.max(0.08, eyeScale)})`);

      // Gaze: look up while thinking, toward the user otherwise.
      const gazeY = current === "thinking" ? -4 : 0;
      const gazeX = current === "thinking" ? 3 * Math.sin(now / 600) : 0;
      pupilsRef.current?.setAttribute("transform", `translate(${gazeX} ${gazeY})`);

      // Head: gentle bob while speaking, slight tilt while listening, calm breathing at idle.
      if (!reduceMotion && headRef.current) {
        const bob =
          current === "speaking"
            ? Math.sin(now / 140) * 1.5 * (0.4 + smoothed)
            : Math.sin(now / 900) * 1.2;
        const tilt = current === "listening" ? -5 : current === "speaking" ? Math.sin(now / 520) * 2 : 0;
        headRef.current.setAttribute("transform", `translate(0 ${bob}) rotate(${tilt} 100 105)`);
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const ring =
    state === "listening" ? "ring-red-200" : state === "speaking" ? "ring-emerald-200" : "ring-border";

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={LABELS[state]}>
      {/* Background halo */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 rounded-full bg-gradient-to-b from-muted to-violet-50 ring-8 ${ring} transition-all duration-500 ${
          state === "speaking" ? "nova-glow" : ""
        }`}
      />
      {state === "listening" && (
        <>
          <span aria-hidden="true" className="nova-ripple absolute inset-0 rounded-full border-4 border-red-300" />
          <span aria-hidden="true" className="nova-ripple nova-ripple-delay absolute inset-0 rounded-full border-4 border-red-300" />
        </>
      )}

      <svg viewBox="0 0 200 200" className="relative h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="nova-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde2cf" />
            <stop offset="1" stopColor="#f4c3a5" />
          </linearGradient>
          <linearGradient id="nova-hair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b2a6b" />
            <stop offset="1" stopColor="#1e1442" />
          </linearGradient>
          <linearGradient id="nova-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
          <clipPath id="nova-circle">
            <circle cx="100" cy="100" r="100" />
          </clipPath>
        </defs>

        <g clipPath="url(#nova-circle)">
          {/* Shoulders */}
          <path d="M30 200 C34 160 62 146 100 146 C138 146 166 160 170 200 Z" fill="url(#nova-top)" />
          <path d="M86 146 L100 166 L114 146 Z" fill="#f4c3a5" />

          <g ref={headRef}>
            {/* Neck */}
            <rect x="89" y="124" width="22" height="26" rx="8" fill="#eab394" />
            {/* Back hair */}
            <path d="M48 92 C44 40 156 40 152 92 L156 140 C150 150 136 146 134 134 L66 134 C64 146 50 150 44 140 Z" fill="url(#nova-hair)" />
            {/* Face */}
            <ellipse cx="100" cy="94" rx="44" ry="50" fill="url(#nova-skin)" />
            {/* Ears */}
            <ellipse cx="57" cy="98" rx="6" ry="10" fill="#f0bc9c" />
            <ellipse cx="143" cy="98" rx="6" ry="10" fill="#f0bc9c" />
            {/* Fringe */}
            <path d="M56 80 C58 46 100 36 128 50 C142 58 146 70 145 82 C128 66 104 60 86 64 C74 66 64 72 56 80 Z" fill="url(#nova-hair)" />
            {/* Headset mic (AI assistant cue) */}
            <path d="M52 96 C50 120 64 132 84 130" stroke="#4f46e5" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="86" cy="130" r="3.5" fill="#4f46e5" />
            <rect x="46" y="88" width="10" height="18" rx="5" fill="#4f46e5" />

            {/* Brows */}
            <path
              d={state === "thinking" ? "M74 70 Q82 64 90 68" : "M74 72 Q82 68 90 71"}
              stroke="#2a1d55"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={state === "listening" ? "M110 69 Q118 64 126 69" : "M110 71 Q118 68 126 72"}
              stroke="#2a1d55"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />

            {/* Eyes (blink via scaleY) */}
            <g ref={eyesRef}>
              <ellipse cx="82" cy="88" rx="7" ry="8" fill="#fff" />
              <ellipse cx="118" cy="88" rx="7" ry="8" fill="#fff" />
              <g ref={pupilsRef}>
                <circle cx="82" cy="89" r="4.5" fill="#2a1d55" />
                <circle cx="118" cy="89" r="4.5" fill="#2a1d55" />
                <circle cx="83.5" cy="87" r="1.4" fill="#fff" />
                <circle cx="119.5" cy="87" r="1.4" fill="#fff" />
              </g>
            </g>

            {/* Cheeks */}
            <ellipse cx="72" cy="106" rx="7" ry="4" fill="#f59e9e" opacity="0.45" />
            <ellipse cx="128" cy="106" rx="7" ry="4" fill="#f59e9e" opacity="0.45" />
            {/* Nose */}
            <path d="M100 94 Q97 104 101 106" stroke="#d99a7c" strokeWidth="2" fill="none" strokeLinecap="round" />

            {/* Mouth: lip-synced */}
            <g>
              <ellipse ref={mouthRef} cx="100" cy="119" rx="13" ry="1.5" fill="#7a2341" />
              <rect ref={teethRef} x="92" y="111" width="16" height="4" rx="2" fill="#fff" opacity="0" />
              {state !== "speaking" && (
                <path d="M88 117 Q100 126 112 117" stroke="#7a2341" strokeWidth="3" fill="none" strokeLinecap="round" />
              )}
            </g>
          </g>
        </g>

        {/* Thinking dots */}
        {state === "thinking" && (
          <g fill="#6366f1">
            <circle className="nova-dot" cx="150" cy="36" r="5" />
            <circle className="nova-dot nova-dot-2" cx="166" cy="24" r="6" />
            <circle className="nova-dot nova-dot-3" cx="184" cy="12" r="7" />
          </g>
        )}
        {/* Listening sound waves */}
        {state === "listening" && (
          <g stroke="#f43f5e" strokeWidth="3" fill="none" strokeLinecap="round">
            <path className="nova-dot" d="M176 90 Q184 100 176 110" />
            <path className="nova-dot nova-dot-2" d="M186 82 Q198 100 186 118" />
          </g>
        )}
      </svg>
    </div>
  );
}
