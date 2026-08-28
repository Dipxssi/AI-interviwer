import z from "zod";
import type { LlmTurnResult } from "./type";

const InterviewDecisionSchema = z.object({
  action: z.enum(["ask_followup", "change_topic", "end_interview"]),
  competency: z
    .enum([
      "ownership",
      "technical_depth",
      "problem_solving",
      "communication",
    ])
    .optional(),
  confidence: z.number().min(0).max(1),
  end_interview: z.boolean(),
});

const LlmTurnResultSchema = z.object({
  spoken_response: z.string().min(1),
  decision: InterviewDecisionSchema,
});


function stripCodeFences(raw: string): string {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const inner = fenced?.[1];
    return inner !== undefined ? inner.trim() : trimmed;
  }

export function parseLlmTurn(raw: string): LlmTurnResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  const parsed = LlmTurnResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Groq JSON failed validation: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}