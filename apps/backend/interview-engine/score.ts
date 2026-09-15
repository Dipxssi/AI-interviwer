import type { InterviewState } from "./type";

/** Importance-weighted average of competency confidence → 0–100. */
export function computeScore(state: InterviewState): number {
  const comps = state.competencies;
  if (comps.length === 0) return 0;

  const totalWeight = comps.reduce((sum, c) => sum + c.importance, 0);
  if (totalWeight <= 0) return 0;

  const weighted = comps.reduce(
    (sum, c) => sum + c.confidence * c.importance,
    0,
  );

  return Math.max(0, Math.min(100, Math.round((100 * weighted) / totalWeight)));
}
