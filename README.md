# AI Interviewer

A **Mercor-style live voice interview MVP**. Candidates upload a resume, link GitHub and LinkedIn, and complete a **zero-click voice interview** — the AI speaks first, listens continuously, and asks follow-up questions based on their profile.

Built as a **cascaded voice pipeline** (streaming ASR → Groq interviewer → TTS), not end-to-end speech-to-speech.

## Features

- **Profile intake** — resume PDF/DOCX parsing, GitHub repo enrichment, structured candidate profile
- **Live voice interview** — WebSocket session with binary PCM up and MP3 down
- **AI speaks first** — opening greeting + first question on connect
- **Streaming ASR** — Deepgram live transcription with partial + final transcripts
- **Structured interviewer** — Groq LLM with interview state machine, competency tracking, end-of-interview rules
- **Chunked TTS** — sentence-level synthesis for faster time-to-first-audio
- **Barge-in** — interrupt the interviewer mid-sentence (client VAD + server cancel)
- **Session FSM** — `IDLE` → `LISTENING` → `CANDIDATE_SPEAKING` → `PROCESSING` → `AI_SPEAKING`
- **Persistence** — Postgres messages, interview state snapshots, realtime latency events
- **UI** — vibrating speaker avatars, live transcripts, interview end screen

## Architecture

```mermaid
flowchart LR
  Browser[Browser mic + playback]
  WS[WebSocket gateway]
  ASR[Deepgram live ASR]
  Engine[Interview engine / Groq]
  TTS[Deepgram TTS]
  PG[(Postgres)]

  Browser -->|PCM 16kHz| WS
  WS --> ASR
  ASR -->|final transcript| WS
  WS --> Engine
  Engine --> TTS
  TTS -->|MP3 chunks| WS
  WS --> Browser
  Engine --> PG
```

| Plane | Format | Purpose |
|-------|--------|---------|
| Control | JSON over WebSocket | state changes, transcripts, barge-in, playback done |
| Audio up | Binary PCM (16 kHz mono s16le) | microphone → ASR |
| Audio down | Binary MP3 | TTS → browser playback |

## Tech stack

| Layer | Stack |
|-------|--------|
| Monorepo | Turborepo, Bun |
| Frontend | React 19, React Router, Tailwind CSS 4 |
| Backend | Express, Bun, WebSocket (`ws`) |
| Database | PostgreSQL 16, Prisma 7 |
| ASR / TTS | Deepgram (Nova-2 + Aura) |
| LLM | Groq (`openai/gpt-oss-20b`, JSON mode) |

## Prerequisites

- [Bun](https://bun.sh) 1.4+
- [Docker](https://www.docker.com/) (for Postgres)
- API keys:
  - `GROQ_API_KEY`
  - `DEEPGRAM_API_KEY`

## Quick start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd interviwer
bun install
```

### 2. Start Postgres

```bash
docker compose up -d
```

Postgres runs on **port 5434** (mapped from container 5432).

### 3. Configure environment

Create `apps/backend/.env`:

```env
DATABASE_URL="postgresql://interviwer:interviwer@localhost:5434/interviwer"
GROQ_API_KEY="your-groq-key"
DEEPGRAM_API_KEY="your-deepgram-key"
```

### 4. Run migrations

```bash
cd apps/backend
bunx prisma migrate deploy
bunx prisma generate
```

### 5. Start servers

**Terminal 1 — backend** (port 3001):

```bash
cd apps/backend
bun index.ts
```

**Terminal 2 — frontend** (port 3000):

```bash
cd apps/frontend
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), complete the intake form, then land on `/interview`.

### Tips for voice testing

- Use **headphones** to avoid echo triggering false barge-in
- Speak in **2–3 sentence chunks**, then pause ~1 second for end-of-turn detection
- Use a **fresh interview** for the opening turn (interviews with existing messages skip the auto-greeting)

## Project structure

```
interviwer/
├── apps/
│   ├── backend/
│   │   ├── interview-engine/   # Groq prompts, state, turn generation
│   │   ├── voice/              # WebSocket gateway, session FSM, run-turn
│   │   ├── services/           # Deepgram ASR/TTS, resume parsing
│   │   └── prisma/             # schema + migrations
│   └── frontend/
│       └── src/
│           ├── components/     # Form, Interview (avatars), Result
│           └── hooks/          # useVoiceInterview (mic, WS, playback)
├── docker-compose.yml
└── package.json
```

## Key endpoints

### Production flow

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/pre-interview` | Upload resume + links → create interview |
| `WS` | `/ws/interview/:id` | Live voice session |

### Debug only

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/interview/:id/voice-turn` | Batch voice turn (upload audio file) |
| `POST` | `/api/v1/asr` | Transcribe audio file |
| `POST` | `/api/v1/tts` | Synthesize text to MP3 |

## Voice session flow

1. User lands on `/interview` → mic permission + WebSocket connect
2. If no prior messages → AI opening turn (`[SESSION_START]`)
3. User speaks → live partials → `speech_final` → Groq turn → chunked TTS
4. Client plays MP3 queue → sends `AUDIO_PLAYBACK_DONE` → `LISTENING`
5. Repeat until interview engine sets `shouldEnd` → `INTERVIEW_ENDED`

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `GROQ_API_KEY` | Yes | Groq API for interviewer LLM |
| `DEEPGRAM_API_KEY` | Yes | Deepgram ASR + TTS |

Frontend backend URL is set in `apps/frontend/src/lib/config.ts` (`BACKEND_URL`, default `http://localhost:3001`).

## MVP scope & future work

**Shipped in this MVP**

- Live cascaded voice loop with barge-in
- Interview state + message persistence
- Basic realtime event logging (`FINAL_TRANSCRIPT`, `LLM_STARTED`, `TTS_STARTED`)

**Not yet implemented**

- Streaming TTS WebSocket (currently sentence-chunked batch TTS)
- Full latency dashboard / `TTS_FIRST_AUDIO` metrics
- Production auth, deployment hardening
- Speculative acknowledgements and learned endpointing

## Portfolio notes

This project demonstrates **real-time systems design**: WebSocket binary transport, voice state machines, cancellation tokens, and a structured LLM controller — not a thin wrapper around a single speech API.

For demos, record a **30–60s screen capture** with headphones and link it in your portfolio README.

## License

Private / portfolio use — add your license if you open-source the repo.
