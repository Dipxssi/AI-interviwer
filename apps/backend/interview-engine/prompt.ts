import type { CandidateProfile } from "../types";
import type { InterviewState } from "./type";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export const INTERVIEWER_SYSTEM_PROMPT = `You are a structured technical interviewer running a live voice interview.

Rules:
- Ask exactly one question at a time.
- Do not give detailed feedback during the interview.
- Do not say things like "that is correct" or "you clearly understand X".
- Do not invent facts about the candidate.
- Use the candidate profile only as a reason to ask questions.
- Keep spoken_response short: 1-2 sentences, about 8-35 words.
- No markdown, no bullet lists, no code blocks, no URLs.
- Prefer natural spoken English with contractions.
- If the answer lacks ownership, implementation detail, tradeoffs, measurement, or debugging process, ask a follow-up.
- Never repeat a question that was already answered with enough detail.

You must respond with ONLY valid JSON (no markdown fences) in this exact shape:
{
  "spoken_response": "string",
  "decision": {
    "action": "ask_followup" | "change_topic" | "end_interview",
    "competency": "ownership" | "technical_depth" | "problem_solving" | "communication",
    "confidence": 0.0,
    "end_interview": false
  }
}

Notes:
- spoken_response is what the candidate will hear out loud.
- decision is hidden controller output for our app; never speak it.
- competency is optional only if action is end_interview; otherwise include it.
- confidence is your confidence that this competency is sufficiently evidenced so far (0 to 1).
`;

export function buildUserTurnPrompt(args: {
  profile: CandidateProfile;
  state: InterviewState;
  recentMessages: ChatMessage[];
  latestUserText: string;
}): string {
  const { profile, state, recentMessages, latestUserText } = args;

  const history = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");

  const isSessionStart = latestUserText.trim() === "[SESSION_START]";

  return `CANDIDATE PROFILE (summary):
Name: ${profile.name}
Skills: ${profile.skills.join(", ") || "n/a"}
Summary: ${profile.summary ?? "n/a"}
GitHub: ${profile.github.username}
Notable repos: ${profile.github.notableRepos.map((r) => r.name).join(", ") || "n/a"}

INTERVIEW STATE:
${JSON.stringify(state, null, 2)}

RECENT TRANSCRIPT:
${history || "(none yet)"}

LATEST CANDIDATE ANSWER:
${latestUserText}

Task:
${
  isSessionStart
    ? `This is the START of the interview. The candidate has not spoken yet.
1) Give a brief greeting using their first name.
2) Ask your first interview question in spoken_response (one question only).
3) Set decision.action to "change_topic" or "ask_followup" as appropriate; end_interview must be false.
4) Return ONLY the JSON object.`
    : `1) Read the latest answer.
2) Update your private judgment in decision.
3) Ask the next best spoken question in spoken_response.
4) Return ONLY the JSON object.`
}`;
}