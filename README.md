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

