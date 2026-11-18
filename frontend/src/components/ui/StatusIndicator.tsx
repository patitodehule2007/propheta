import type { JSX } from "react";

export const ConnectionState = {
    LIVE: "live",
    DOWN: "down",
    NOT_WIRED: "not-wired"
} as const;
export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

const STATE_LABEL: Record<ConnectionState, string> = {
    live: "live",
    down: "down",
    "not-wired": "not wired"
};

export interface StatusIndicatorProps {
    name: string;
    state: ConnectionState;
}

/**
 * Connection health: a shaped mark plus a text state, so it never relies on color alone.
 *
 * @param props - Display name and current connection state.
 * @returns The rendered indicator.
 */
export function StatusIndicator({ name, state }: StatusIndicatorProps): JSX.Element {
    return (
        <span className="status" data-state={state}>
            <span className="status-mark" aria-hidden="true" />
            <span className="status-name">{name}</span>
            <span className="status-state">{STATE_LABEL[state]}</span>
        </span>
    );
}
