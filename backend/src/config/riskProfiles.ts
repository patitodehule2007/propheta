/**
 * Named presets for how aggressively gates 1 and 4 let trades through. The
 * selection agent never sees these: it reports an honest estimate, and only
 * the deterministic gates apply the operator's appetite.
 * `docs/backend/tradeDecision.md` §"Risk profiles".
 */
export const RiskProfile = {
    CONSERVATIVE: "CONSERVATIVE",
    BALANCED: "BALANCED",
    AGGRESSIVE: "AGGRESSIVE"
} as const;

export type RiskProfile = (typeof RiskProfile)[keyof typeof RiskProfile];

export interface RiskProfilePreset {
    /** Gate 1: minimum classifier confidence. */
    minConfidence: number;
    /** Gate 4: edge required on top of round-trip fees, in cents. */
    minNetEdgeCents: number;
    /** Gate 4: per-trade size cap, percent of the capital base. */
    maxTradeExposurePct: number;
    /**
     * Gate 4: how much low conviction shrinks the model's edge toward the
     * quoted price. 0 trusts the model's fair value outright; 1 scales the
     * edge fully by conviction.
     */
    edgeShrinkage: number;
}

export const RISK_PROFILE_PRESETS: Record<RiskProfile, RiskProfilePreset> = {
    CONSERVATIVE: { minConfidence: 0.7, minNetEdgeCents: 4, maxTradeExposurePct: 1, edgeShrinkage: 1 },
    BALANCED: { minConfidence: 0.6, minNetEdgeCents: 2, maxTradeExposurePct: 2, edgeShrinkage: 0.5 },
    AGGRESSIVE: { minConfidence: 0.5, minNetEdgeCents: 1, maxTradeExposurePct: 3, edgeShrinkage: 0 }
};

/**
 * Validates a raw profile name, failing startup on a typo rather than
 * silently trading under the wrong appetite.
 * @param value - raw profile name, e.g. from configuration
 * @returns the matching profile
 * @throws {Error} when the value is not a known profile
 */
export function parseRiskProfile(value: string): RiskProfile {
    const match = Object.values(RiskProfile).find((profile) => profile === value.toUpperCase());
    if (!match) {
        throw new Error(`Unknown risk profile "${value}"; expected one of ${Object.values(RiskProfile).join(", ")}`);
    }
    return match;
}
