import type { JSX } from "react";

import { ConnectionState, StatusIndicator } from "./ui";

const KILL_SWITCH_UNAVAILABLE = "Kill switch is not available yet";

/**
 * System health strip pinned above every authenticated page. The backend does not
 * expose connection health or a kill switch yet, so both render their honest
 * "not wired" / unavailable state instead of a fabricated "live".
 */
export function StatusBar(): JSX.Element {
    return (
        <header className="status-bar" aria-label="System status">
            <StatusIndicator name="X webhook" state={ConnectionState.NOT_WIRED} />
            <StatusIndicator name="Kalshi WebSocket" state={ConnectionState.NOT_WIRED} />
            <span className="status-bar-spacer" />
            <button
                type="button"
                className="kill-switch ui-press"
                aria-disabled="true"
                aria-describedby="kill-switch-note"
                title={KILL_SWITCH_UNAVAILABLE}
            >
                <span className="kill-switch-glyph" aria-hidden="true">
                    ⏻
                </span>
                KILL SWITCH
            </button>
            <span id="kill-switch-note" className="visually-hidden">
                {KILL_SWITCH_UNAVAILABLE}
            </span>
        </header>
    );
}
