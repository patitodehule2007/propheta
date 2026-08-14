export interface DecisionLogEntry {
    id: string;
    ingestedPostId: string | null;
    platformPostId: string | null;
    stage: string;
    decision: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}
