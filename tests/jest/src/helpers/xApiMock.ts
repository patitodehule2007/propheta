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

interface Decision {
    id: string;
    platformPostId: string;
    stage: string;
    decision: string;
    reason: string | null;
}

/**
 * Polls the backend's audit log endpoint until a decision_log row exists
 * for the given platform post id, or the timeout elapses.
 */
export async function waitForDecision(platformPostId: string, timeoutMs = 10000): Promise<Decision> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const response = await fetch(
            `${BACKEND_URL}/api/webhooks/x/decisions?platformPostId=${encodeURIComponent(platformPostId)}`
        );
        const body = (await response.json()) as { data: { items: Decision[] } };
        const decision = body.data.items[0];
        if (decision) return decision;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`No decision_log entry for platformPostId=${platformPostId} within ${timeoutMs}ms`);
}
