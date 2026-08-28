import type {CandidateProfile}   from  "../types"
import type {CompetencyState, InterviewState} from "./type"

function emptyCometency(key: CompetencyState['key'], importance: number): CompetencyState{
    return {
        key,
        importance,
        confidence: 0,
        followUpNeeded: true,
        evidence: []
    };
}

export function createInitialState(_profile: CandidateProfile, targetRole = "Software Engineer"): InterviewState{
    return{
        phase: "intro",
        targetRole,
        competencies: [
            emptyCometency("ownership", 0.9),
            emptyCometency("technical_depth", 0.9),
            emptyCometency("problem_solving", 0.8),
            emptyCometency("communication", 0.7),

        ],

        askedQuestionIds: [],
        coveredTopics: [],
        turnCount: 0,
        shouldEnd: false,
    };
}

export function applyDecisionToState(
    state: InterviewState,
    decision:{
        competency?: CompetencyState['key'],
        confidence: number;
        end_interview: boolean
    },
    canEnd: boolean
):InterviewState{
    const next = {...state,
        turnCount: state.turnCount + 1,
        competencies: state.competencies.map((c) => {
            if (!decision.competency || c.key !== decision.competency)  return c;
            return {
                ...c,
                confidence: Math.max(c.confidence, decision.confidence),
                followUpNeeded: decision.confidence < 0.7,
            }
        })
    };

    if (decision.end_interview && canEnd) {
        next.shouldEnd = true;
        next.phase = "complete";
    } else if (next.phase === "intro" && next.turnCount >= 1) {
        next.phase = "resume_validation";
    }
    return next;
}