import type {InterviewState} from "./type";

export function canEndInterview(state: InterviewState): boolean{
    const requiredCovered = state.competencies
           .filter((c) => c.importance >= 0.8)
           .every((c) => c.confidence >= 0.7)

    const enoughEvidence = 
    state.competencies.filter((c) => c.evidence.length >=1).length >= 2;

    const noCriticalFellowups = !state.competencies.some(
        (c) => c.followUpNeeded && c.importance >= 0.8,
    )

    const minTurns = state.turnCount >= 4;

    return (
        requiredCovered && enoughEvidence && noCriticalFellowups && minTurns
    );
}