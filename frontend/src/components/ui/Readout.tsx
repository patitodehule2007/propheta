import type { JSX } from "react";

const EMPTY_VALUE = "—";

export interface ReadoutProps {
    label: string;
    /** Formatted figure; `null` renders an empty slot. */
    value: string | null;
    note?: string;
}

/**
 * A large monospace figure with its label, used in the dashboard readout row.
 *
 * @param props - Label, formatted value (or null), and an optional note.
 * @returns The rendered readout.
 */
export function Readout({ label, value, note }: ReadoutProps): JSX.Element {
    const isEmpty = value === null;
    return (
        <div className="readout">
            <span className="readout-label">{label}</span>
            <span className="readout-value" data-empty={isEmpty || undefined}>
                {isEmpty ? EMPTY_VALUE : value}
            </span>
            {note !== undefined && <span className="readout-note">{note}</span>}
        </div>
    );
}
