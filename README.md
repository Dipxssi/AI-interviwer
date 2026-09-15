# Voice Interviewer

Live voice interviews: Deepgram ASR → Groq interviewer → Deepgram TTS.

## Run

```bash
# backend
cd apps/backend && bun index.ts

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
