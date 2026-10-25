# Voice Interviewer

Live voice interviews: Deepgram ASR → Groq interviewer → Deepgram TTS.

## Run

```bash
# Postgres (optional local)
docker compose up -d

# backend — copy apps/backend/.env.example → .env first
cd apps/backend && bun run dev

# frontend
cd apps/frontend && bun run dev
```

- Candidate intake: http://localhost:3000
- Supervisor reviews: http://localhost:3000/reviews

## Flow

1. Candidate submits LinkedIn, GitHub, resume → interview created.
2. Voice WebSocket session; AI greets and asks questions.
3. Saying “I’m done” / “end interview” wraps up; natural end when coverage is enough.
4. Score (0–100) saved; candidate lands on `/result/:id`.
5. Supervisors open `/reviews` for transcript, competencies, and evidence.

## Voice state machine

`IDLE → LISTENING → CANDIDATE_SPEAKING → PROCESSING → AI_SPEAKING → LISTENING`  
(or `ENDING` when complete). Barge-in interrupts AI speech.

## Deploy (Vercel + Render)

Architecture: **frontend on Vercel** (static SPA), **API + WebSockets on Render** (Docker/Bun), **Postgres on Render**.

### 1. Backend on Render

1. Push this repo to GitHub/GitLab.
2. In Render: **New → Blueprint** and select the repo (uses [`render.yaml`](render.yaml)), or create a Web Service from the Dockerfile at the repo root.
3. Set env vars on `interviwer-api` (Blueprint marks these as sync:false):
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://your-app.vercel.app`); add after frontend exists, then redeploy
   - `GROQ_API_KEY`
   - `DEEPGRAM_API_KEY`
4. `DATABASE_URL` is wired from the `interviwer-db` Postgres instance.
5. On start, the container runs `prisma migrate deploy` then the API. Health check: `GET /health`.
6. Note the service URL, e.g. `https://interviwer-api.onrender.com`.

Free Render web services spin down when idle; the first request (and WebSocket) may be slow to wake.

### 2. Frontend on Vercel

1. Import the same repo in Vercel as a **single** project (not multi-service).
2. Set **Root Directory** to `apps/frontend` (uses [`apps/frontend/vercel.json`](apps/frontend/vercel.json)).
3. Set build env:
   - `PUBLIC_BACKEND_URL` = Render HTTPS URL (no trailing slash), e.g. `https://interviwer-api.onrender.com`
4. If Build Command is overridden in the dashboard, use `bun run build` and Output Directory `dist`.
5. Deploy. Client routes (`/reviews`, `/result/:id`) are rewritten to `index.html`.

### 3. Wire CORS

Set `FRONTEND_URL` on Render to the Vercel origin and redeploy the API so browsers can call REST and open WebSockets.

### Env reference

| Variable | Where | Purpose |
|----------|--------|---------|
| `PUBLIC_BACKEND_URL` | Vercel (build) | API base URL baked into the SPA |
| `DATABASE_URL` | Render | Prisma Postgres |
| `FRONTEND_URL` | Render | CORS allowed origin(s), comma-separated |
| `GROQ_API_KEY` | Render | Interviewer LLM |
| `DEEPGRAM_API_KEY` | Render | ASR + TTS |
| `PORT` | Render (auto) | HTTP listen port |

See [`apps/backend/.env.example`](apps/backend/.env.example) and [`apps/frontend/.env.example`](apps/frontend/.env.example).
