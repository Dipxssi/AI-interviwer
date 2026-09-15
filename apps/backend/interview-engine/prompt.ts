import type { CandidateProfile } from "../types";
import type { InterviewState } from "./type";
import { MAX_FOLLOWUPS_PER_COMPETENCY } from "./type";

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

Progression (critical — avoid loops):
- At most ONE follow-up per competency. After that you MUST change_topic.
- Prefer covering all competencies over perfect depth on one.
- NEVER repeat or rephrase a question you already asked.
- If the candidate gave a partial answer, take one sharper follow-up OR move on — do not keep circling the same gap.
- Rotate competencies: ownership → technical_depth → problem_solving → communication.
- When changing topic, ask something clearly new (different project aspect, tradeoff, failure, metric, debugging).
- If the candidate asks to end, stop, wrap up, or says they are done: thank them briefly, say the interview is complete, do NOT ask another question, set action to "end_interview" and end_interview to true.

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
- Use ask_followup sparingly. Default to change_topic when unsure.
`;

function followUpBudgetLines(state: InterviewState): string {
  return state.competencies
    .map((c) => {
      const left = Math.max(
        0,
        MAX_FOLLOWUPS_PER_COMPETENCY - c.followUpCount,
      );
      const status =
        left === 0
          ? "FOLLOW-UP BUDGET EXHAUSTED — must change_topic if touching this"
          : `${left} follow-up(s) left`;
      return `- ${c.key}: confidence=${c.confidence.toFixed(2)}, evidence=${c.evidence.length}, ${status}`;
    })
    .join("\n");
}

export function buildUserTurnPrompt(args: {
  profile: CandidateProfile;
  state: InterviewState;
  recentMessages: ChatMessage[];
  latestUserText: string;
  userRequestedEnd?: boolean;
}): string {
  const { profile, state, recentMessages, latestUserText, userRequestedEnd } =
    args;

  const history = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");

  const priorAssistantQs = recentMessages
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => `- ${m.text}`)
    .join("\n");

  const isSessionStart = latestUserText.trim() === "[SESSION_START]";

  let task: string;
  if (isSessionStart) {
    task = `This is the START of the interview. The candidate has not spoken yet.
1) Give a brief greeting using their first name.
2) Ask your first interview question in spoken_response (one question only) about ownership or a recent project.
3) Set decision.action to "change_topic"; end_interview must be false.
4) Return ONLY the JSON object.`;
  } else if (userRequestedEnd) {
    task = `The candidate asked to END the interview.
1) Thank them briefly and say the interview is complete.
2) Do NOT ask another question.
3) Set decision.action to "end_interview" and end_interview to true.
4) Include competency + confidence for the last topic if relevant.
5) Return ONLY the JSON object.`;
  } else {
    task = `1) Read the latest answer and the DO-NOT-REPEAT list.
2) If the current competency still has follow-up budget AND the answer is thin, you may ask ONE sharper follow-up (action=ask_followup).
3) Otherwise MUST change_topic to a different competency with a clearly new question (action=change_topic).
4) Never rephrase a prior assistant question.
5) If coverage is broad enough, you may wrap up with end_interview true.
6) Return ONLY the JSON object.`;
  }

  return `CANDIDATE PROFILE (summary):
Name: ${profile.name}
Skills: ${profile.skills.join(", ") || "n/a"}
Summary: ${profile.summary ?? "n/a"}
GitHub: ${profile.github.username}
Notable repos: ${profile.github.notableRepos.map((r) => r.name).join(", ") || "n/a"}

INTERVIEW STATE:
phase=${state.phase}, turnCount=${state.turnCount}, lastCompetency=${state.lastCompetency ?? "none"}
coveredTopics=${state.coveredTopics.join(", ") || "none"}

COMPETENCY BUDGETS:
${followUpBudgetLines(state)}

DO NOT REPEAT THESE QUESTIONS:
${priorAssistantQs || "(none yet)"}

RECENT TRANSCRIPT:
${history || "(none yet)"}

LATEST CANDIDATE ANSWER:
${latestUserText}

Task:
${task}`;
}
