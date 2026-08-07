import { createHmac } from "crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Same HMAC-SHA256-over-base64 scheme the backend verifies against
 * (backend/src/modules/ingestion/signatureVerification.service.ts).
 */
export function signPayload(secret: string, payload: string): string {
    return SIGNATURE_PREFIX + createHmac("sha256", secret).update(payload).digest("base64");
}
