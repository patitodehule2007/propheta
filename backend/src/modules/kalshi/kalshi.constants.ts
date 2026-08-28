/**
 * Constants for the Kalshi Trade API v2 REST client.
 * https://docs.kalshi.com/api-reference
 */

/** Header carrying the API key id. */
export const KALSHI_ACCESS_KEY_HEADER = "KALSHI-ACCESS-KEY";

/** Header carrying the base64 RSA-PSS signature of the request. */
export const KALSHI_ACCESS_SIGNATURE_HEADER = "KALSHI-ACCESS-SIGNATURE";

/** Header carrying the signing timestamp, in milliseconds since the epoch. */
export const KALSHI_ACCESS_TIMESTAMP_HEADER = "KALSHI-ACCESS-TIMESTAMP";

/** Digest Kalshi expects for the RSA-PSS signature. */
export const KALSHI_SIGNATURE_DIGEST = "sha256";

/** Encoding of the signature value placed in the signature header. */
export const KALSHI_SIGNATURE_ENCODING = "base64";

/**
 * REST paths, relative to the configured base URL (which already ends in
 * `/trade-api/v2`). Parameterised segments are encoded by the builders so no
 * caller has to remember to do it.
 */
export const KALSHI_PATHS = {
    exchangeStatus: "/exchange/status",
    exchangeSchedule: "/exchange/schedule",
    markets: "/markets",
    market: (ticker: string): string => `/markets/${encodeURIComponent(ticker)}`,
    marketOrderbook: (ticker: string): string => `/markets/${encodeURIComponent(ticker)}/orderbook`,
    trades: "/markets/trades",
    events: "/events",
    event: (eventTicker: string): string => `/events/${encodeURIComponent(eventTicker)}`,
    balance: "/portfolio/balance",
    positions: "/portfolio/positions",
    fills: "/portfolio/fills",
    orders: "/portfolio/orders",
    order: (orderId: string): string => `/portfolio/orders/${encodeURIComponent(orderId)}`,
    // V2 write path. The legacy `/portfolio/orders` write endpoint is
    // deprecated no earlier than May 6, 2026.
    eventOrders: "/portfolio/events/orders",
    eventOrder: (orderId: string): string => `/portfolio/events/orders/${encodeURIComponent(orderId)}`
} as const;
