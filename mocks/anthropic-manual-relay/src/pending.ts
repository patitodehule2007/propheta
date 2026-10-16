import { createHash, randomUUID } from "crypto";
import { Response } from "express";

import { renderPrompt } from "./render";
import { MessagesRequest } from "./types";

export interface PendingRequest {
    id: string;
    bodyHash: string;
    prompt: string;
    request: MessagesRequest;
    /** Open backend connections waiting on this answer (more than one after an SDK retry). */
    waiters: Set<Response>;
}

// Map iteration follows insertion order, so the first entry is the oldest.
const pending = new Map<string, PendingRequest>();

export interface TrackResult {
    entry: PendingRequest;
    isRetry: boolean;
}

/**
 * Queues a held `/v1/messages` request. The SDK retries a timed-out request
 * with the identical body, so a matching body joins the existing entry
 * instead of queueing a duplicate prompt.
 */
export function trackRequest(request: MessagesRequest, waiter: Response): TrackResult {
    const bodyHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const existing = Array.from(pending.values()).find((entry) => entry.bodyHash === bodyHash);
    if (existing) {
        existing.waiters.add(waiter);
        return { entry: existing, isRetry: true };
    }

    const entry: PendingRequest = {
        id: randomUUID(),
        bodyHash,
        prompt: renderPrompt(request),
        request,
        waiters: new Set([waiter])
    };
    pending.set(entry.id, entry);
    return { entry, isRetry: false };
}

export function oldestPending(): PendingRequest | undefined {
    return pending.values().next().value;
}

export function findPending(id: string): PendingRequest | undefined {
    return pending.get(id);
}

export function removePending(id: string): void {
    pending.delete(id);
}

export function pendingCount(): number {
    return pending.size;
}
