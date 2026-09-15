import type { CandidateProfile } from "../types";
import type {
  CompetencyKey,
  CompetencyState,
  InterviewDecision,
  InterviewPhase,
  InterviewState,
} from "./type";
import { MAX_FOLLOWUPS_PER_COMPETENCY } from "./type";
import { canEndInterview } from "./can-end";

function emptyCompetency(
  key: CompetencyState["key"],
  importance: number,
): CompetencyState {
  return {
    key,
    importance,
    confidence: 0,
    followUpNeeded: true,
    followUpCount: 0,
    evidence: [],
  };
}

/** Normalize older snapshots that lack newer competency fields. */
export function normalizeInterviewState(raw: InterviewState): InterviewState {
  return {
    ...raw,
    coveredTopics: raw.coveredTopics ?? [],
    askedQuestionIds: raw.askedQuestionIds ?? [],
    competencies: (raw.competencies ?? []).map((c) => ({
      ...c,
      followUpCount: c.followUpCount ?? c.evidence?.length ?? 0,
      followUpNeeded: c.followUpNeeded ?? c.confidence < 0.65,
      evidence: c.evidence ?? [],
    })),
  };
}

export function createInitialState(
  _profile: CandidateProfile,
  targetRole = "Software Engineer",
): InterviewState {
  return {
    phase: "intro",
    targetRole,
    competencies: [
      emptyCompetency("ownership", 0.9),
      emptyCompetency("technical_depth", 0.9),
      emptyCompetency("problem_solving", 0.8),
      emptyCompetency("communication", 0.7),
    ],
    askedQuestionIds: [],
    coveredTopics: [],
    turnCount: 0,
    shouldEnd: false,
  };
}

export type ApplyDecisionOpts = {
  forceEnd?: boolean;
  latestUserText?: string;
  spokenResponse?: string;
};

function nextPhase(turnCount: number, current: InterviewPhase): InterviewPhase {
  if (current === "complete") return current;
  if (turnCount <= 1) return "intro";
  if (turnCount <= 3) return "resume_validation";
  if (turnCount <= 6) return "project_deep_dive";
  if (turnCount <= 9) return "technical_reasoning";
  if (turnCount <= 11) return "behavioral";
  return "candidate_questions";
}

/** Prefer a different competency when follow-up budget is exhausted. */
export function pickNextCompetency(
  state: InterviewState,
  preferred?: CompetencyKey,
): CompetencyKey {
  const ranked = [...state.competencies].sort((a, b) => {
    // Prefer ones that still need coverage and have budget left.
    const aDone =
      a.followUpCount >= MAX_FOLLOWUPS_PER_COMPETENCY || a.confidence >= 0.7;
    const bDone =
      b.followUpCount >= MAX_FOLLOWUPS_PER_COMPETENCY || b.confidence >= 0.7;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.confidence !== b.confidence) return a.confidence - b.confidence;
    return b.importance - a.importance;
  });

  const notLast = ranked.find((c) => c.key !== state.lastCompetency);
  if (preferred && preferred !== state.lastCompetency) {
    const p = ranked.find((c) => c.key === preferred);
    if (p && p.followUpCount < MAX_FOLLOWUPS_PER_COMPETENCY) return preferred;
  }
  return (notLast ?? ranked[0])!.key;
}

/**
 * If the model wants another follow-up but that competency is spent,
 * force a topic change to the next weakest competency.
 */
export function enforceTopicProgression(
  state: InterviewState,
  decision: InterviewDecision,
): InterviewDecision {
  if (decision.action !== "ask_followup" || !decision.competency) {
    return decision;
  }

  const comp = state.competencies.find((c) => c.key === decision.competency);
  if (!comp) return decision;

  const exhausted =
    comp.followUpCount >= MAX_FOLLOWUPS_PER_COMPETENCY ||
    comp.evidence.length >= 2;

  if (!exhausted) return decision;

  const nextKey = pickNextCompetency(state, decision.competency);
  return {
    ...decision,
    action: "change_topic",
    competency: nextKey,
  };
}

export function applyDecisionToState(
  state: InterviewState,
  decision: Pick<
    InterviewDecision,
    "action" | "competency" | "confidence" | "end_interview"
  >,
  opts: ApplyDecisionOpts = {},
): InterviewState {
  const latest = opts.latestUserText?.trim() ?? "";
  const canCaptureEvidence =
    Boolean(decision.competency) &&
    latest.length > 0 &&
    latest !== "[SESSION_START]";

  const next: InterviewState = {
    ...state,
    turnCount: state.turnCount + 1,
    lastCompetency: decision.competency ?? state.lastCompetency,
    competencies: state.competencies.map((c) => {
      if (!decision.competency || c.key !== decision.competency) return c;

      const evidence = [...c.evidence];
      if (canCaptureEvidence) {
        evidence.push({
          claim: `Response related to ${c.key}`,
          supportingQuote: latest.slice(0, 280),
          confidence: decision.confidence,
        });
      }

      let followUpCount = c.followUpCount;
      if (decision.action === "ask_followup") {
        followUpCount += 1;
      }

      const budgetUsed =
        followUpCount >= MAX_FOLLOWUPS_PER_COMPETENCY || evidence.length >= 2;

      // Accept partial signal and move on — don't dig forever.
      const confidence = budgetUsed
        ? Math.max(c.confidence, decision.confidence, 0.55)
        : Math.max(c.confidence, decision.confidence);

      return {
        ...c,
        confidence,
        followUpCount,
        followUpNeeded: budgetUsed ? false : confidence < 0.65,
        evidence,
      };
    }),
  };

  if (decision.competency && !next.coveredTopics.includes(decision.competency)) {
    next.coveredTopics = [...next.coveredTopics, decision.competency];
  }

  if (opts.spokenResponse?.trim()) {
    const qid = opts.spokenResponse.trim().slice(0, 80).toLowerCase();
    if (!next.askedQuestionIds.includes(qid)) {
      next.askedQuestionIds = [...next.askedQuestionIds, qid].slice(-20);
    }
  }

  const naturalEnd = decision.end_interview && canEndInterview(next);
  const shouldEnd = Boolean(opts.forceEnd) || naturalEnd;

  if (shouldEnd) {
    next.shouldEnd = true;
    next.phase = "complete";
  } else {
    next.phase = nextPhase(next.turnCount, next.phase);
  }

  return next;
}
