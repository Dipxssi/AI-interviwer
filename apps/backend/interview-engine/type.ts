export type InterviewPhase =
  | "intro"
  | "resume_validation"
  | "project_deep_dive"
  | "technical_reasoning"
  | "behavioral"
  | "candidate_questions"
  | "complete";

export type CompetencyKey =
  | "ownership"
  | "technical_depth"
  | "problem_solving"
  | "communication";

export type CompetencyState = {
  key: CompetencyKey;
  importance: number; 
  confidence: number; 
  followUpNeeded: boolean;
  evidence: Array<{
    claim: string;
    supportingQuote: string;
    confidence: number;
  }>;
};

export type InterviewState = {
  phase: InterviewPhase;
  targetRole: string;
  competencies: CompetencyState[];
  askedQuestionIds: string[];
  coveredTopics: string[];
  turnCount: number;
  shouldEnd: boolean;
};

export type InterviewDecision = {
  action: "ask_followup" | "change_topic" | "end_interview";
  competency?: CompetencyKey;
  confidence: number;
  end_interview: boolean;
};

export type LlmTurnResult = {
  spoken_response: string;
  decision: InterviewDecision;
};