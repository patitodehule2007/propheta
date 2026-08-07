import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_PREFIX = "sha256=";

function hmacBase64(secret: string, payload: string | Buffer): string {
    return SIGNATURE_PREFIX + createHmac("sha256", secret).update(payload).digest("base64");
}

/**
 * Verifies the `x-twitter-webhooks-signature` header against the raw request
 * body. Comparison is constant-time to avoid leaking timing information.
 *
 * @param rawBody Exact bytes received on the wire (never the re-serialized JSON).
 * @param secret Consumer secret shared with the X app.
 * @param headerValue Value of the `x-twitter-webhooks-signature` header, if present.
 */
export function verifyWebhookSignature(
    rawBody: string | Buffer,
    secret: string,
    headerValue: string | undefined
): boolean {
    if (!headerValue) return false;

    const expected = Buffer.from(hmacBase64(secret, rawBody));
    const actual = Buffer.from(headerValue);
    if (expected.length !== actual.length) return false;

    return timingSafeEqual(expected, actual);
}

/**
 * Computes the CRC challenge response token X expects back for a given
 * `crc_token` query parameter.
 *
 * @param crcToken Value of the `crc_token` query parameter on the challenge GET.
 * @param secret Consumer secret shared with the X app.
 */
export function computeCrcResponseToken(crcToken: string, secret: string): string {
    return hmacBase64(secret, crcToken);
}
