# Interviwer

An AI-powered voice interview platform inspired by Mercor. Candidates upload a resume, link their GitHub and LinkedIn profiles, and the system builds a rich candidate profile used to conduct a personalized voice interview.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Profile intake (resume, GitHub, LinkedIn) | Done |
| 2 | Voice interview engine (STT → LLM → TTS) | Planned |
| 3 | Evaluation, scoring, and results page | Planned |
| 4 | Production polish (auth, deploy) | Planned |

## How it works

```mermaid
flowchart LR
  subgraph frontend [Frontend — localhost:3000]
    Form[Profile Form]
    Interview[Voice Interview]
    Result[Results]
  end

  subgraph backend [Backend — localhost:3001]
    API[Express API]
    LLM[Groq LLM]
    PDF[PDF / DOCX Parser]
  end

  subgraph external [External Services]
    GitHub[GitHub API]
    Groq[Groq API]
  end

  subgraph data [Data]
    PG[(PostgreSQL)]
  end

  Form -->|multipart upload| API
  API --> PDF
  PDF --> LLM
  API --> GitHub
  LLM --> Groq
  API --> PG
  Form --> Interview
  Interview --> Result
```

### Profile intake flow

1. Candidate submits LinkedIn URL, GitHub URL, and a resume (PDF or DOCX).
2. Backend extracts raw text from the resume.
3. Groq LLM parses structured fields (name, skills, experience, education).
4. GitHub API enriches the profile with bio, languages, and notable repos.
5. Everything is merged into a `CandidateProfile` and saved to Postgres.
6. Frontend navigates to the interview page with the profile in context.

## Tech stack

| Layer | Technologies |
|-------|--------------|
| Monorepo | Turborepo, Bun workspaces |
| Frontend | React 19, React Router, Tailwind CSS, shadcn/ui, Axios |
| Backend | Express, Bun, Multer, Zod |
| Database | PostgreSQL 16, Prisma 7 (driver adapter + `@prisma/adapter-pg`) |
| AI | Groq (`openai/gpt-oss-20b`) for resume parsing |
| Resume parsing | `pdf-parse`, `mammoth` (DOCX) |

## Project structure

```
interviwer/
├── apps/
│   ├── frontend/          # React app (port 3000)
│   │   └── src/
│   │       ├── components/   # Form, Interview, Result
│   │       ├── context/      # ProfileContext (shared session state)
│   │       └── types/        # CandidateProfile types
│   └── backend/           # Express API (port 3001)
│       ├── index.ts          # API routes
│       ├── db.ts             # Prisma client setup
│       ├── types.ts          # Zod schemas
│       ├── services/         # resume-text, resume-parse-llm
│       └── prisma/           # schema + migrations
├── docker-compose.yml     # Local Postgres
└── turbo.json
```

## Prerequisites

- [Bun](https://bun.sh) 1.4+
- [Docker](https://www.docker.com/) (for local Postgres)
- [Groq API key](https://console.groq.com/)

## Getting started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd interviwer
bun install
```

### 2. Start the database

```bash
docker compose up -d
```

Postgres runs on **host port 5434** (mapped to container port 5432).

### 3. Configure environment

Create `apps/backend/.env`:

```env
DATABASE_URL=postgresql://interviwer:interviwer@localhost:5434/interviwer?schema=public
GROQ_API_KEY=your_groq_api_key_here
```

> Never commit `.env`. A committed `.env.example` with placeholder values is recommended for collaborators.

### 4. Run database migrations

```bash
cd apps/backend
bunx prisma migrate deploy
bunx prisma generate
```

Run `bunx prisma generate` whenever you change `schema.prisma`.

### 5. Start the apps

**Option A — both apps via Turborepo (from repo root):**

```bash
bun run dev
```

**Option B — separately:**

```bash
# Terminal 1 — backend
cd apps/backend
bun index.ts

# Terminal 2 — frontend
cd apps/frontend
bun run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |

## API

### `POST /api/v1/pre-interview`

Creates a candidate profile and interview session.

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `linkedin` | string (URL) | Yes |
| `github` | string (URL) | Yes |
| `resume` | file (PDF or DOCX) | Yes |

**Response:**

```json
{
  "profile": { "name": "...", "skills": [], "github": {}, "linkedin": {} },
  "interviewId": "uuid"
}
```

## Database schema

```prisma
Interview {
  id          String   @id @default(uuid())
  linkedinUrl String
  profile     Json     // merged CandidateProfile
  status      InterviewStatus  // Pre | Inprogress | Done
  score       Int      @default(0)
  conversation Message[]
}

Message {
  id          String   @id @default(uuid())
  message     String
  type        MessageType  // USER | ASSISTANT
  interviewId String
}
```

Inspect data locally:

```bash
cd apps/backend
bunx prisma studio
```

## Frontend routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Form | Upload resume, enter LinkedIn & GitHub URLs |
| `/interview` | Interview | Voice interview session (in progress) |
| `/result` | Result | Final score and feedback (planned) |

Session data (`profile`, `interviewId`) is shared across routes via `ProfileContext`.

## Git — what to commit vs ignore

| Commit | Ignore |
|--------|--------|
| `prisma/schema.prisma` | `.env` |
| `prisma/migrations/` | `apps/backend/generated/prisma/` |
| `docker-compose.yml` | `node_modules/` |

## Roadmap

- [ ] Voice interview engine — STT, TTS, question loop
- [ ] `POST /interview/start` and `POST /interview/answer` endpoints
- [ ] Save conversation as `Message` rows
- [ ] AI evaluation and scoring
- [ ] Results page with feedback
- [ ] `/interview/:id` route with refresh support

## License

Private — all rights reserved.
