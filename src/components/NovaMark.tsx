import { cn } from "@/lib/utils";

/** Nova's face — static head crop of the talking avatar, used as logo and chat avatar. */
export default function NovaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 overflow-hidden rounded-full border bg-gradient-to-b from-violet-100 to-indigo-100",
        className,
      )}
    >
      <svg viewBox="40 34 120 120" className="size-full" role="img" aria-label="SU Agent">
        <defs>
          <linearGradient id="nm-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde2cf" />
            <stop offset="1" stopColor="#f4c3a5" />
          </linearGradient>
          <linearGradient id="nm-hair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b2a6b" />
            <stop offset="1" stopColor="#1e1442" />
          </linearGradient>
          <linearGradient id="nm-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M30 200 C34 160 62 146 100 146 C138 146 166 160 170 200 Z" fill="url(#nm-top)" />
        <rect x="89" y="124" width="22" height="26" rx="8" fill="#eab394" />
        <path d="M48 92 C44 40 156 40 152 92 L156 140 C150 150 136 146 134 134 L66 134 C64 146 50 150 44 140 Z" fill="url(#nm-hair)" />
        <ellipse cx="100" cy="94" rx="44" ry="50" fill="url(#nm-skin)" />
        <path d="M56 80 C58 46 100 36 128 50 C142 58 146 70 145 82 C128 66 104 60 86 64 C74 66 64 72 56 80 Z" fill="url(#nm-hair)" />
        <path d="M52 96 C50 120 64 132 84 130" stroke="#4f46e5" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="46" y="88" width="10" height="18" rx="5" fill="#4f46e5" />
        <path d="M74 72 Q82 68 90 71" stroke="#2a1d55" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M110 71 Q118 68 126 72" stroke="#2a1d55" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="82" cy="88" rx="7" ry="8" fill="#fff" />
        <ellipse cx="118" cy="88" rx="7" ry="8" fill="#fff" />
        <circle cx="82" cy="89" r="4.5" fill="#2a1d55" />
        <circle cx="118" cy="89" r="4.5" fill="#2a1d55" />
        <ellipse cx="72" cy="106" rx="7" ry="4" fill="#f59e9e" opacity="0.45" />
        <ellipse cx="128" cy="106" rx="7" ry="4" fill="#f59e9e" opacity="0.45" />
        <path d="M88 117 Q100 126 112 117" stroke="#7a2341" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}
