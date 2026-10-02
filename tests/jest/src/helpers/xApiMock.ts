const X_API_MOCK_URL = process.env.X_API_BASE_URL ?? "http://x-api-mock-test:4100";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";

/**
 * Registers the real backend's webhook endpoint with the mock X server,
 * triggering (and asserting) a successful CRC challenge.
 */
export async function registerBackendWebhook(): Promise<{ id: string; valid: boolean }> {
    const response = await fetch(`${X_API_MOCK_URL}/2/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `${BACKEND_URL}/api/webhooks/x` })
    });
    const body = (await response.json()) as { data: { id: string; valid: boolean } };
    return body.data;
}

/**
 * Drives a post.create delivery through the mock, signed against the shared
 * test consumer secret unless `corruptSignature` is set.
 */
export async function simulatePost(params: {
    userId: string;
    text: string;
    postId?: string;
    corruptSignature?: boolean;
}): Promise<{ postId: string; deliveryStatus: number }> {
    const response = await fetch(`${X_API_MOCK_URL}/mock/simulate-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
    });
    const body = (await response.json()) as { data: { postId: string; deliveryStatus: number } };
    return body.data;
}

export interface Decision {
    id: string;
    platformPostId: string;
    stage: string;
    decision: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
}

/**
 * Polls the backend's audit log endpoint until a decision_log row exists
 * for the given platform post id, or the timeout elapses.
 *
 * A post accumulates one row per pipeline stage it reaches, so pass `stage`
 * to assert on a specific one — without it the most recent row wins, which is
 * only unambiguous for posts that stop at ingestion.
 */
export async function waitForDecision(
    platformPostId: string,
    options: { stage?: string; timeoutMs?: number } = {}
): Promise<Decision> {
    const { stage, timeoutMs = 10000 } = options;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const response = await fetch(
            `${BACKEND_URL}/api/webhooks/x/decisions?platformPostId=${encodeURIComponent(platformPostId)}`
        );
        const body = (await response.json()) as { data: { items: Decision[] } };
        const decision = stage ? body.data.items.find((item) => item.stage === stage) : body.data.items[0];
        if (decision) return decision;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const target = stage ? `${platformPostId} at stage ${stage}` : platformPostId;
    throw new Error(`No decision_log entry for platformPostId=${target} within ${timeoutMs}ms`);
}

/**
 * Returns every stage recorded for a post, oldest first. Used to assert that a
 * stage was NOT reached, which `waitForDecision` cannot express.
 */
export async function listDecisionStages(platformPostId: string): Promise<string[]> {
    const response = await fetch(
        `${BACKEND_URL}/api/webhooks/x/decisions?platformPostId=${encodeURIComponent(platformPostId)}`
    );
    const body = (await response.json()) as { data: { items: Decision[] } };
    return body.data.items.map((item) => item.stage).reverse();
}

// The decisions endpoint's own MAX_PAGE_SIZE: EXIT rows are newest-first, so
// the one a test is waiting on is always on the first page.
const EXIT_SCAN_PAGE_SIZE = 100;

/**
 * Polls the audit log until gate 6 writes an `EXIT` row for the given
 * position, or the timeout elapses. EXIT rows carry no platform post id (the
 * exit supervisor runs on its own sweep, detached from any post), so this
 * scans the unfiltered, newest-first log for `metadata.positionId`.
 */
export async function waitForExitDecision(positionId: string, options: { timeoutMs?: number } = {}): Promise<Decision> {
    const { timeoutMs = 15000 } = options;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/x/decisions?limit=${EXIT_SCAN_PAGE_SIZE}`);
        const body = (await response.json()) as { data: { items: Decision[] } };
        const decision = body.data.items.find(
            (item) => item.stage === "EXIT" && item.metadata?.positionId === positionId
        );
        if (decision) return decision;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`No EXIT decision_log entry for positionId=${positionId} within ${timeoutMs}ms`);
}
