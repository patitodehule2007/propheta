import type { CSSProperties, JSX } from "react";

export interface SkeletonRowsProps {
    rows: number;
    /** Class that sets the tape grid columns, so the skeleton mirrors the real rows. */
    tapeClassName: string;
    /** Relative width (0–100) of the bar in each column. */
    columnWidths: number[];
    label: string;
}

/**
 * Tape-shaped loading placeholder that mirrors the real row grid.
 *
 * @param props - Row count, tape class, per-column bar widths, and accessible label.
 * @returns The rendered skeleton list.
 */
export function SkeletonRows({ rows, tapeClassName, columnWidths, label }: SkeletonRowsProps): JSX.Element {
    const rowKeys = Array.from({ length: rows }, (_, index) => index);
    return (
        <div className={`tape ${tapeClassName}`} role="status" aria-label={label}>
            {rowKeys.map((rowKey) => (
                <div key={rowKey} className="tape-row" aria-hidden="true">
                    {columnWidths.map((width, columnIndex) => {
                        const style: CSSProperties = { width: `${width}%` };
                        return <span key={columnIndex} className="skeleton" style={style} />;
                    })}
                </div>
            ))}
        </div>
    );
}
