import { config } from "../../config";
import { ExternalServiceError } from "../../shared/core/errors";

/**
 * Shape of the X API webhook resource fields this module relies on.
 * https://docs.x.com/x-api/activity/introduction
 */
export interface XWebhook {
    created_at: string;
    id: string;
    url: string;
    valid: boolean;
}

interface XApiEnvelope<T> {
    data: T;
}

async function xApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${config.xApi.baseUrl}${path}`, {
        ...init,
        headers: {
            ...init?.headers,
            Authorization: `Bearer ${config.xApi.bearerToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        throw new ExternalServiceError(`X API request to ${path} failed with status ${response.status}`);
    }

    const body = (await response.json()) as XApiEnvelope<T>;
    return body.data;
}

/**
 * Lists every webhook currently registered on the X account.
 */
export async function listXWebhooks(): Promise<XWebhook[]> {
    return xApiRequest<XWebhook[]>("/2/webhooks");
}

/**
 * Registers a new webhook target URL with X. X performs a CRC challenge
 * against the URL synchronously as part of this call.
 *
 * @param url The publicly reachable URL X will deliver events to.
 */
export async function createXWebhook(url: string): Promise<XWebhook> {
    return xApiRequest<XWebhook>("/2/webhooks", {
        method: "POST",
        body: JSON.stringify({ url })
    });
}
