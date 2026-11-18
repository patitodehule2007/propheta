import type { JSX } from "react";

import type { ChipTone } from "../../shared/decisionFormat";

const EMPTY_VALUE = "—";

export interface ReadoutProps {
    label: string;
    /** Formatted figure; `null` renders an empty slot. */
    value: string | null;
    note?: string;
    /** Colors the figure; the value itself must still carry its sign. */
    tone?: ChipTone;
}

/**
 * A large monospace figure with its label, used in the dashboard readout row.
 *
 * @param props - Label, formatted value (or null), an optional note and tone.
 * @returns The rendered readout.
 */
export function Readout({ label, value, note, tone }: ReadoutProps): JSX.Element {
    const isEmpty = value === null;
    return (
        <div className="readout">
            <span className="readout-label">{label}</span>
            <span className="readout-value" data-empty={isEmpty || undefined} data-tone={tone}>
                {isEmpty ? EMPTY_VALUE : value}
            </span>
            {note !== undefined && <span className="readout-note">{note}</span>}
        </div>
    );
}
