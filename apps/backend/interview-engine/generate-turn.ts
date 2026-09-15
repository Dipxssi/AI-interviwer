import OpenAI from "openai";
import type { CandidateProfile } from "../types";
import type { InterviewState, LlmTurnResult } from "./type";
import {
  INTERVIEWER_SYSTEM_PROMPT,
  buildUserTurnPrompt,
  type ChatMessage,
} from "./prompt";
import { parseLlmTurn } from "./parse";
import { applyDecisionToState, enforceTopicProgression } from "./state";
import { userWantsToEndInterview } from "./user-wants-end";
import { computeScore } from "./score";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export type GenerateTurnInput = {
  profile: CandidateProfile;
  state: InterviewState;
  recentMessages: ChatMessage[];
  latestUserText: string;
};

export type GenerateTurnOutput = {
  spoken_response: string;
  decision: LlmTurnResult["decision"];
  nextState: InterviewState;
  score: number;
  raw: string;
};

export async function generateTurn(
  input: GenerateTurnInput,
): Promise<GenerateTurnOutput> {
  const forceEnd = userWantsToEndInterview(input.latestUserText);
  const userPrompt = buildUserTurnPrompt({
    ...input,
    userRequestedEnd: forceEnd,
  });

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INTERVIEWER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from Groq interviewer");
  }

  const turn = parseLlmTurn(raw);

  if (forceEnd) {
    turn.decision.action = "end_interview";
    turn.decision.end_interview = true;
  } else {
    turn.decision = enforceTopicProgression(input.state, turn.decision);
  }

  const nextState = applyDecisionToState(input.state, turn.decision, {
    forceEnd,
    latestUserText: input.latestUserText,
    spokenResponse: turn.spoken_response,
  });

  return {
    spoken_response: turn.spoken_response,
    decision: turn.decision,
    nextState,
    score: computeScore(nextState),
    raw,
  };
}
