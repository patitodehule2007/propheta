const KALSHI_MOCK_URL = process.env.KALSHI_API_BASE_URL ?? "http://kalshi-mock-test:4300";

const CENTS_PER_DOLLAR = 100;
// Keeps a test-built book coherent: the derived YES ask sits this far above
// the YES bid, inside the test stack's MAX_SPREAD_CENTS.
const BUILT_BOOK_SPREAD_CENTS = 2;
const BUILT_BOOK_CONTRACTS = "20.00";

/** [price_dollars, count] tuple, as the Kalshi API (and its mock) publish it. */
export type PriceLevel = [string, string];

export interface Orderbook {
    yes_dollars: PriceLevel[];
    no_dollars: PriceLevel[];
}

function centsToDollars(cents: number): string {
    return (cents / CENTS_PER_DOLLAR).toFixed(4);
}

async function sendControlRequest(method: string, path: string, body?: unknown): Promise<void> {
    const response = await fetch(`${KALSHI_MOCK_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`kalshi-mock ${method} ${path} failed with status ${response.status}`);
    }
}

/**
 * Builds a one-level book whose best YES bid is `yesBidCents`, with the NO
 * bid placed so the derived YES ask stays a normal spread above it.
 *
 * @param yesBidCents - best YES bid, in cents (the held-side bid exit supervision reads for a YES position)
 * @returns an order book in the mock's wire format
 */
export function buildOrderbookWithYesBid(yesBidCents: number): Orderbook {
    const noBidCents = CENTS_PER_DOLLAR - yesBidCents - BUILT_BOOK_SPREAD_CENTS;
    return {
        yes_dollars: [[centsToDollars(yesBidCents), BUILT_BOOK_CONTRACTS]],
        no_dollars: [[centsToDollars(noBidCents), BUILT_BOOK_CONTRACTS]]
    };
}

/**
 * Replaces a ticker's order book in kalshi-mock. The backend reads it on its
 * next live order-book fetch (the quote poller is off in the test stack).
 *
 * @param ticker - a market ticker kalshi-mock already serves
 * @param orderbook - the new book
 * @throws when the mock rejects the request (unknown ticker, malformed book)
 */
export async function setOrderbook(ticker: string, orderbook: Orderbook): Promise<void> {
    await sendControlRequest("PUT", `/mock/orderbooks/${encodeURIComponent(ticker)}`, orderbook);
}

/**
 * Moves a market's close time in kalshi-mock. The backend's market cache
 * picks it up on its next refresh (`MARKET_CACHE_REFRESH_MS`).
 *
 * @param ticker - a market ticker kalshi-mock already serves
 * @param closeTime - the new close time
 * @throws when the mock rejects the request
 */
export async function setMarketCloseTime(ticker: string, closeTime: Date): Promise<void> {
    await sendControlRequest("PATCH", `/mock/markets/${encodeURIComponent(ticker)}`, {
        close_time: closeTime.toISOString()
    });
}

/**
 * Restores every kalshi-mock market and order book to its startup fixture.
 *
 * @throws when the mock rejects the request
 */
export async function resetKalshiMock(): Promise<void> {
    await sendControlRequest("POST", "/mock/reset");
}
