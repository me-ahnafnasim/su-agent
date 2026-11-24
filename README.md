# SU Agent — functional demo

A single Next.js app (UI + API on one origin): Bangla-speaking AI agent with chat, RAG over
three fictional documents, persistent conversation memory, a simulated task tool, and a
**talking avatar** with natural voice.

> Functional demo / prototype only. No authentication, rate limiting or audit logging.
> Use fictional data only. Not production-ready.

## Features

| Mode | What it does |
| --- | --- |
| **💬 চ্যাট (Chat)** | Typed chat. Mic fills the input (you press Send). Voice ON/OFF reads replies aloud. |
| **🎙️ কথা বলুন (Talk)** | Voice conversation with an animated Nova avatar. Tap, speak in Bangla; when you stop, it is **sent automatically** (intentional), and Nova answers out loud. Mouth lip-syncs to the voice loudness; blinks, head motion, listening/thinking states. A text box is available when the mic is not supported. |

Both modes share one conversation (`sessionId` in localStorage), so memory carries over.

- **Agent:** LangGraph ReAct agent on a Gemini chat model, tools `search_knowledge` (Qdrant) and `execute_task` (simulated, returns `ACT-XXXXXXXX`).
- **Memory:** LangGraph `PostgresSaver`, `thread_id = sessionId`; survives restarts. History sent to the model is windowed and repaired so an aborted request cannot break a session.
- **Voice output:** `POST /api/tts` uses Gemini text-to-speech (same API key) for a natural voice; if not configured or it fails, the browser's `speechSynthesis` (bn-BD) is used.
- **Voice input:** browser Web Speech API, `bn-BD`.

## Setup

Prerequisites: Node.js 22+, PostgreSQL, a Google AI Studio API key, a Qdrant Cloud cluster.

```bash
npm ci
cp .env.example .env.local     # fill in real values — never commit .env.local
npm run init:memory            # creates PostgreSQL checkpoint tables
npm run seed:knowledge         # embeds data/*.txt into Qdrant (idempotent)
npm run dev                    # http://localhost:3000
```

### Environment (`.env.local`)

| Variable | Notes |
| --- | --- |
| `GOOGLE_API_KEY` | Google AI Studio key (server-only). |
| `GOOGLE_CHAT_MODEL` | A current Flash model ID with tool calling — check the live model list. |
| `GOOGLE_EMBEDDING_MODEL` | A current embedding model ID. Changing it requires a new collection or deliberate reindex. |
| `GOOGLE_TTS_MODEL` | *Optional.* A current Gemini TTS model ID for the natural voice. Check its free-tier quota. Empty → browser voice. |
| `GOOGLE_TTS_VOICE` | *Optional.* Prebuilt voice name (default `Kore`). |
| `GOOGLE_STT_MODEL` | *Optional.* Model that transcribes recorded voice where the browser has no speech recognition (Brave). Defaults to the chat model; a lite model is faster. |
| `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | Collection defaults to `my_custom_agent_db` (cosine, size detected from embeddings). |
| `DATABASE_URL`, `DATABASE_SSL` | PostgreSQL; set `DATABASE_SSL=true` for hosted providers needing TLS. |
| `MEMORY_BACKEND` | `postgres` (default) or `memory` (smoke tests only — no restart persistence). |

Optional tuning: `REQUEST_TIMEOUT_MS` (≤ 55000), `MAX_HISTORY_MESSAGES`, `MAX_GRAPH_STEPS`,
`QDRANT_TOP_K`, `QDRANT_SCORE_THRESHOLD`, `EMBEDDING_CHUNK_SIZE`, `EMBEDDING_CHUNK_OVERLAP`.

### Reindexing after changing the embedding model

The seed script refuses to mix vector sizes. Set a new `QDRANT_COLLECTION` and run
`npm run seed:knowledge`; existing data is never deleted automatically.

## Knowledge base (`data/*.txt`)

Every `.txt` file in `data/` is indexed (75 chunks, `EMBEDDING_CHUNK_SIZE=1000` so each paragraph stays whole); its first line becomes the document title. Add or edit a
file, then run `npm run seed:knowledge` (idempotent — unchanged chunks are upserted, removed
chunks are pruned per file).

| File | Content |
| --- | --- |
| `su-overview.txt` | Sonargaon University: owners/founders (SU Trust, Engr. Abdul Aziz, Engr. Abdul Alim), VC/Pro-VC/Treasurer/Registrar, deans, vision, awards, contact |
| `su-campuses.txt` | Permanent (Khilgaon), Green Road and Mohakhali campuses, facilities, transport, clubs |
| `su-programs.txt` | Faculties, 13 undergraduate + 9 Master's programs, credits, durations, batch availability, MBA majors |
| `su-classes-semesters.txt` | Tri/bi-semester system, SUN/STAR/MOON class times, attendance, evaluation, grading, admission and fee basics |
| `su-admission.txt` | Sessions, process (no admission test), documents, eligibility, engineering/diploma rules, ACCA/CA, re-admission, credit transfer |
| `su-fees-waivers.txt` | Full Spring-2027 fee sheet per program × batch × GPA band, Master's fees, waivers/quotas, early-payment and payment rules |
| `su-academic-rules.txt` | Registration/add-drop, attendance marks, marks distribution, GPA/CGPA, supplementary/retake/improvement, probation, honours and medals |
| `su-student-life.txt` | 28 clubs, SWD, events, sports, career support, research portals, what SU does not offer |
| `uni-faq.txt`, `company-policy.txt`, `product-list.txt` | Fictional demo fixtures from the requirements |

SU data comes from the verified Sonargaon University knowledge skill (Spring-2027 corrections applied).
Semester-wise course lists per program are **not** included — Nova says so instead of guessing.

## API

```http
POST /api/chat   {"message":"Hello Nova","sessionId":"demo-session-001"}
→ 200 {"reply":"..."} | 400 {"error":"Invalid request"} | 503 {"error":"Nova is temporarily unavailable. Please retry."}

POST /api/tts    {"text":"..."}  → 200 audio/wav | 400 | 503 (client falls back to browser voice)
POST /api/stt    <audio/wav body, ≤3 MB> → 200 {"text":"..."} | 400 | 413 | 503
GET  /api/health → {"status":"ok", "checks": {...configured flags, no secrets}}
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint / `next typegen && tsc --noEmit` |
| `npm test` | Vitest unit + integration (no external services) |
| `npm run test:e2e` | Playwright UI tests with mocked `/api/chat` (needs `npx playwright install chromium`) |
| `npm run build` / `npm start` | Production build / server |

## Test status (2026-11-24)

| Check | Result |
| --- | --- |
| Lint, typecheck | ✅ clean |
| Vitest (44 tests: validation, chunking/IDs, simulated task, history repair, config, TTS, `/api/chat`, `/api/tts`, `/api/health`) | ✅ passed |
| `npm run build` | ✅ passed (no service connections at build time) |
| Browser check in Brave (desktop + 390 px mobile): Chat/Talk modes, error banner keeps unsent text, avatar idle → thinking → speaking, lip-sync responds to audio | ✅ observed (with mocked API/voice) |
| Playwright e2e | ⏳ not run yet (browser download pending) |
| Live: Gemini + Qdrant (7 chunks, re-seed idempotent) + Neon Postgres (checkpoint tables) | ✅ connected |
| Test 1 — introduces itself as Nova in Bangla, does not name the model provider | ✅ |
| Test 2 — "library close on Thursdays?" → ৭:১৫ (7:15 PM); parking-fee policy → "not found in uploaded knowledge" | ✅ |
| Test 3 — laptop ticket recalled in same session, **and after a full server restart** (Neon) | ✅ |
| Test 4 — WiFi/laptop tasks return `ACT-XXXXXXXX`, status simulated, logged in dev output | ✅ |
| Voice: natural TTS (`/api/tts`) and Brave voice input via `/api/stt` round-trip | ✅ (real-mic test by user pending) |

Models verified with the project key (2026-11-24): chat `gemini-3.5-flash-lite`, embeddings
`gemini-embedding-2` (3072-d), TTS `gemini-3.8-flash-tts`, transcription `gemini-3.1-flash-lite`.
`gemini-3.5-flash` worked but hit the free-tier quota (429) after a few agent turns; each user
message uses 2–3 model calls, so lite models are the better free-tier default.

## Known limitations

- **Brave** has no speech-recognition service, so the app records the mic and transcribes it on the server (`/api/stt`, `GOOGLE_STT_MODEL`). Chrome/Edge use their built-in recognition.
- **Free-tier quotas:** a 429 from Gemini surfaces as "Nova is temporarily unavailable"; wait a minute or use a lite model.
- **Linux browsers** often have **no speechSynthesis voices** unless `speech-dispatcher`/`espeak-ng` is installed; the natural Gemini voice avoids this.
- Gemini TTS availability and free-tier quotas change — verify in AI Studio.
- Voice needs HTTPS or `localhost`.
- `sessionId` is a conversation identifier, not a security boundary.
