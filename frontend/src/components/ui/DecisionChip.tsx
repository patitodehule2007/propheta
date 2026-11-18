import type { JSX } from "react";

import type { ChipTone } from "../../shared/decisionFormat";
import { formatEnumValue, toneForDecision } from "../../shared/decisionFormat";

const TONE_GLYPH: Record<ChipTone, string> = {
    up: "▲",
    down: "▼",
    neutral: "○"
};

export interface DecisionChipProps {
    decision: string;
}

/**
 * Decision outcome as a glyph + text chip; tone is never carried by color alone.
 *
 * @param props - Raw decision outcome.
 * @returns The rendered chip.
 */
export function DecisionChip({ decision }: DecisionChipProps): JSX.Element {
    const tone = toneForDecision(decision);
    return (
        <span className="chip" data-tone={tone} title={formatEnumValue(decision)}>
            <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
            <span className="chip-text">{formatEnumValue(decision)}</span>
        </span>
    );
}
