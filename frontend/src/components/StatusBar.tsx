import type { JSX } from "react";

import type { SystemStatus } from "../types/dashboard";
import { ConnectionState, StatusIndicator } from "./ui";

const KILL_SWITCH_UNAVAILABLE = "Kill switch is not available yet";

const NOT_WIRED_STATUS: SystemStatus = {
    xWebhook: ConnectionState.NOT_WIRED,
    kalshiWebSocket: ConnectionState.NOT_WIRED
};

/**
 * System health strip pinned above every authenticated page. The backend does not
 * expose connection health or a kill switch yet, so by default both render their honest
 * "not wired" / unavailable state instead of a fabricated "live".
 *
 * @param props - Connection health; defaults to "not wired".
 * @returns The rendered status bar.
 */
export function StatusBar({ status = NOT_WIRED_STATUS }: { status?: SystemStatus }): JSX.Element {
    return (
        <header className="status-bar" aria-label="System status">
            <StatusIndicator name="X webhook" state={status.xWebhook} />
            <StatusIndicator name="Kalshi WebSocket" state={status.kalshiWebSocket} />
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
