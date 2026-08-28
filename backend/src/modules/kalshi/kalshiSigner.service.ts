import crypto from "node:crypto";

import { config } from "../../config";
import { ExternalServiceError } from "../../shared/core/errors";
import {
    KALSHI_ACCESS_KEY_HEADER,
    KALSHI_ACCESS_SIGNATURE_HEADER,
    KALSHI_ACCESS_TIMESTAMP_HEADER,
    KALSHI_SIGNATURE_DIGEST,
    KALSHI_SIGNATURE_ENCODING
} from "./kalshi.constants";

/**
 * Parsed once and reused: parsing a PEM on every request is pure overhead.
 */
let cachedPrivateKey: crypto.KeyObject | undefined;

/**
 * Parses the configured PEM into a key object, caching the result.
 *
 * @returns the RSA private key used to sign requests
 * @throws {ExternalServiceError} when Kalshi credentials are not configured, or
 * the configured PEM cannot be parsed
 */
function getPrivateKey(): crypto.KeyObject {
    if (cachedPrivateKey) {
        return cachedPrivateKey;
    }

    if (!config.kalshi.apiKeyId || !config.kalshi.privateKey) {
        throw new ExternalServiceError("Kalshi API credentials are not configured");
    }

    cachedPrivateKey = crypto.createPrivateKey(config.kalshi.privateKey);
    return cachedPrivateKey;
}

/**
 * Signs the canonical request string with RSA-PSS over SHA-256.
 *
 * Kalshi signs `timestamp + HTTP_METHOD + path`, where `path` is the full path
 * from the API root (including the `/trade-api/v2` prefix) with the query
 * string removed. The host is never part of the payload.
 *
 * @param timestamp - signing timestamp in milliseconds since the epoch
 * @param method - upper-case HTTP method
 * @param signedPath - full request path from the API root, without query string
 * @returns the base64-encoded signature
 * @throws {ExternalServiceError} when credentials are missing or unparseable
 */
function signRequest(timestamp: string, method: string, signedPath: string): string {
    const message = Buffer.from(`${timestamp}${method}${signedPath}`, "utf8");

    return crypto
        .sign(KALSHI_SIGNATURE_DIGEST, message, {
            key: getPrivateKey(),
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        })
        .toString(KALSHI_SIGNATURE_ENCODING);
}

/**
 * Builds the three authentication headers Kalshi requires on every request.
 * Public endpoints accept them too, so they are attached unconditionally.
 *
 * @param method - HTTP method of the request being signed
 * @param signedPath - full request path from the API root, without query string
 * @returns the authentication headers to merge into the request
 * @throws {ExternalServiceError} when Kalshi credentials are not configured
 */
export function buildAuthHeaders(method: string, signedPath: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = signRequest(timestamp, method.toUpperCase(), signedPath);

    return {
        [KALSHI_ACCESS_KEY_HEADER]: config.kalshi.apiKeyId,
        [KALSHI_ACCESS_SIGNATURE_HEADER]: signature,
        [KALSHI_ACCESS_TIMESTAMP_HEADER]: timestamp
    };
}
