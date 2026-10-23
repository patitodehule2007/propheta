import { randomUUID } from "crypto";
import express, { Request, Response } from "express";

import { config } from "./config";
import {
    MARKETS,
    MockMarket,
    MockOrder,
    MockSeries,
    MockOrderbook,
    ORDERBOOKS,
    ORDERS_BY_CLIENT_ID,
    replaceOrderbook,
    resetState,
    SERIES,
    updateMarketCloseTime
} from "./state";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// --- Exchange ---------------------------------------------------------------

app.get("/exchange/status", (_req: Request, res: Response) => {
    res.status(200).json({ exchange_active: true, trading_active: true });
});

app.get("/exchange/schedule", (_req: Request, res: Response) => {
    res.status(200).json({ schedule: { standard_hours: [], maintenance_windows: [] } });
});

// --- Series -------------------------------------------------------------

type PresentedSeries = Omit<MockSeries, "volume_fp"> & Partial<Pick<MockSeries, "volume_fp">>;

/** Real Kalshi omits `volume_fp` unless the request passes `include_volume=true`. */
function presentSeries(series: MockSeries, req: Request): PresentedSeries {
    if (req.query.include_volume === "true") return series;
    const { volume_fp: _omitted, ...withoutVolume } = series;
    return withoutVolume;
}

app.get("/series", (req: Request, res: Response) => {
    const tags = typeof req.query.tags === "string" ? req.query.tags.split(",") : null;
    const category = typeof req.query.category === "string" ? req.query.category : null;

    const matches = SERIES.filter((series) => {
        if (category && series.category !== category) return false;
        if (tags && !tags.some((tag) => series.tags.includes(tag))) return false;
        return true;
    });

    res.status(200).json({ series: matches.map((series) => presentSeries(series, req)) });
});

app.get("/series/fee_changes", (_req: Request, res: Response) => {
    res.status(200).json({ fee_changes: [] });
});

app.get("/series/:ticker", (req: Request, res: Response) => {
    const series = SERIES.find((entry) => entry.ticker === req.params.ticker);
    if (!series) {
        res.status(404).json({ error: "series not found" });
        return;
    }
    res.status(200).json({ series: presentSeries(series, req) });
});

app.get("/search/tags_by_categories", (_req: Request, res: Response) => {
    const categories = SERIES.reduce<Record<string, string[]>>((acc, series) => {
        acc[series.category] = Array.from(new Set([...(acc[series.category] ?? []), ...series.tags]));
        return acc;
    }, {});
    res.status(200).json({ categories });
});

// --- Markets --------------------------------------------------------------

app.get("/markets/orderbooks", (req: Request, res: Response) => {
    // Repeated `tickers=` params, as the real API expects. Express parses one
    // occurrence as a string and several as an array.
    const rawTickers = req.query.tickers;
    const tickers = (Array.isArray(rawTickers) ? rawTickers : [rawTickers]).filter(
        (ticker): ticker is string => typeof ticker === "string"
    );
    const orderbooks = tickers
        .filter((ticker) => ORDERBOOKS[ticker])
        .map((ticker) => ({ ticker, orderbook_fp: ORDERBOOKS[ticker] }));
    res.status(200).json({ orderbooks });
});

app.get("/markets/trades", (_req: Request, res: Response) => {
    res.status(200).json({ trades: [], cursor: "" });
});

app.get("/markets/:ticker/orderbook", (req: Request, res: Response) => {
    const orderbook = ORDERBOOKS[String(req.params.ticker)];
    if (!orderbook) {
        res.status(404).json({ error: "orderbook not found" });
        return;
    }
    res.status(200).json({ orderbook_fp: orderbook });
});

app.get("/markets/:ticker", (req: Request, res: Response) => {
    const market = MARKETS.find((entry) => entry.ticker === req.params.ticker);
    if (!market) {
        res.status(404).json({ error: "market not found" });
        return;
    }
    res.status(200).json({ market });
});

/**
 * The real API filters with one vocabulary (`status=open`) and returns
 * another (`"status": "active"`); the mock reproduces that split so the
 * backend cannot pass tests by comparing against the filter value.
 */
const MARKET_STATUS_FILTERS: Record<string, MockMarket["status"]> = {
    open: "active",
    closed: "closed",
    settled: "finalized"
};

app.get("/markets", (req: Request, res: Response) => {
    const seriesTicker = typeof req.query.series_ticker === "string" ? req.query.series_ticker : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    const status = statusFilter ? MARKET_STATUS_FILTERS[statusFilter] : null;

    const matches = MARKETS.filter((market) => {
        if (seriesTicker && market.series_ticker !== seriesTicker) return false;
        if (status && market.status !== status) return false;
        return true;
    });

    res.status(200).json({ markets: matches, cursor: "" });
});

// --- Events -----------------------------------------------------------------

app.get("/events", (_req: Request, res: Response) => {
    res.status(200).json({ events: [], cursor: "" });
});

app.get("/events/:eventTicker", (req: Request, res: Response) => {
    res.status(200).json({ event: { event_ticker: req.params.eventTicker }, markets: [] });
});

// --- Portfolio --------------------------------------------------------------

app.get("/portfolio/balance", (_req: Request, res: Response) => {
    res.status(200).json({
        balance: 100_000,
        balance_dollars: "1000.00",
        portfolio_value: 100_000,
        updated_ts: Date.now()
    });
});

app.get("/portfolio/positions", (_req: Request, res: Response) => {
    res.status(200).json({ market_positions: [], event_positions: [] });
});

app.get("/portfolio/fills", (_req: Request, res: Response) => {
    res.status(200).json({ fills: [], cursor: "" });
});

app.get("/portfolio/orders", (_req: Request, res: Response) => {
    res.status(200).json({ orders: Array.from(ORDERS_BY_CLIENT_ID.values()), cursor: "" });
});

app.get("/portfolio/orders/:orderId", (req: Request, res: Response) => {
    const order = Array.from(ORDERS_BY_CLIENT_ID.values()).find((entry) => entry.order_id === req.params.orderId);
    if (!order) {
        res.status(404).json({ error: "order not found" });
        return;
    }
    res.status(200).json({ order });
});

// --- Order creation (V2) ----------------------------------------------------
// Assumes an immediate full fill at the submitted price -- this mock has no
// matching engine. `client_order_id` is required, like the real API, and a
// repeat returns 409 so the backend's idempotent-success path is exercised.

app.post("/portfolio/events/orders", (req: Request, res: Response) => {
    const body = req.body as {
        ticker?: string;
        side?: "bid" | "ask";
        count?: string;
        price?: string;
        client_order_id?: string;
    };

    if (!body.ticker || !body.side || !body.count || !body.price) {
        res.status(400).json({ error: "ticker, side, count and price are required" });
        return;
    }

    const clientOrderId = body.client_order_id ?? randomUUID();
    const existing = ORDERS_BY_CLIENT_ID.get(clientOrderId);
    if (existing) {
        res.status(409).json({ error: "client_order_id already exists", order_id: existing.order_id });
        return;
    }

    const order: MockOrder = {
        order_id: randomUUID(),
        client_order_id: clientOrderId,
        ticker: body.ticker,
        side: body.side,
        count: body.count,
        price: body.price,
        ts_ms: Date.now()
    };
    ORDERS_BY_CLIENT_ID.set(clientOrderId, order);

    res.status(201).json({
        order_id: order.order_id,
        client_order_id: order.client_order_id,
        fill_count: order.count,
        remaining_count: "0.00",
        average_fill_price: order.price,
        average_fee_paid: "0.00",
        ts_ms: order.ts_ms
    });
});

app.delete("/portfolio/events/orders/:orderId", (req: Request, res: Response) => {
    const order = Array.from(ORDERS_BY_CLIENT_ID.values()).find((entry) => entry.order_id === req.params.orderId);
    res.status(200).json({
        order_id: req.params.orderId,
        client_order_id: order?.client_order_id,
        reduced_by: "0.00",
        ts_ms: Date.now()
    });
});

// --- Test-only controls -----------------------------------------------------
// Not part of the real Kalshi API. Let integration tests move prices and close
// times so exit supervision (gate 6) has something to react to, then restore
// the fixtures so the next test starts clean.

function isPriceLevelList(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.every(
            (level) =>
                Array.isArray(level) &&
                level.length === 2 &&
                typeof level[0] === "string" &&
                typeof level[1] === "string"
        )
    );
}

app.put("/mock/orderbooks/:ticker", (req: Request, res: Response) => {
    const body = req.body as Partial<MockOrderbook>;
    if (!isPriceLevelList(body.yes_dollars) || !isPriceLevelList(body.no_dollars)) {
        res.status(400).json({ error: "yes_dollars and no_dollars must be [price, count] string tuples" });
        return;
    }

    const orderbook: MockOrderbook = { yes_dollars: body.yes_dollars ?? [], no_dollars: body.no_dollars ?? [] };
    if (!replaceOrderbook(String(req.params.ticker), orderbook)) {
        res.status(404).json({ error: "orderbook not found" });
        return;
    }
    res.status(200).json({ orderbook_fp: orderbook });
});

app.patch("/mock/markets/:ticker", (req: Request, res: Response) => {
    const closeTime = (req.body as { close_time?: unknown }).close_time;
    if (typeof closeTime !== "string" || Number.isNaN(Date.parse(closeTime))) {
        res.status(400).json({ error: "close_time must be an ISO-8601 timestamp" });
        return;
    }

    const market = updateMarketCloseTime(String(req.params.ticker), closeTime);
    if (!market) {
        res.status(404).json({ error: "market not found" });
        return;
    }
    res.status(200).json({ market });
});

app.post("/mock/reset", (_req: Request, res: Response) => {
    resetState();
    res.status(204).send();
});

app.listen(config.port, "0.0.0.0", () => {
    console.log(`kalshi-mock listening on ${config.port}`);
});
