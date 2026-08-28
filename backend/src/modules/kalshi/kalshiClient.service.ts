import { KALSHI_PATHS } from "./kalshi.constants";
import { kalshiHttpClient } from "./kalshiHttp.service";
import {
    CancelOrderParams,
    CancelOrderResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    ExchangeStatus,
    GetBalanceParams,
    GetBalanceResponse,
    GetEventParams,
    GetEventResponse,
    GetEventsParams,
    GetEventsResponse,
    GetExchangeScheduleResponse,
    GetFillsParams,
    GetFillsResponse,
    GetMarketOrderbookParams,
    GetMarketOrderbookResponse,
    GetMarketResponse,
    GetMarketsParams,
    GetMarketsResponse,
    GetOrderResponse,
    GetOrdersParams,
    GetOrdersResponse,
    GetPositionsParams,
    GetPositionsResponse,
    GetTradesParams,
    GetTradesResponse
} from "./kalshi.types";

/**
 * Thin typed wrapper over the Kalshi Trade API v2 REST surface.
 *
 * Every function maps one-to-one onto an endpoint and returns the raw response
 * body. Cursor pagination is passed through rather than hidden, so callers stay
 * in control of how many pages they pull. Domain rules — market matching, risk
 * limits, dry-run — belong in the services that call this module.
 *
 * https://docs.kalshi.com/api-reference
 */

/**
 * Issues a signed GET request and returns the response body.
 *
 * @param path - path relative to the configured Kalshi base URL
 * @param params - optional query parameters; `undefined` values are omitted
 * @returns the parsed response body
 * @throws {ExternalServiceError} when the request fails or credentials are missing
 */
async function get<TResponse>(path: string, params?: object): Promise<TResponse> {
    const response = await kalshiHttpClient.get<TResponse>(path, { params });
    return response.data;
}

export const kalshiService = {
    // --- Exchange -------------------------------------------------------------

    /**
     * Reads whether the exchange and trading are currently active.
     *
     * @returns the current exchange status
     * @throws {ExternalServiceError} when the request fails
     */
    getExchangeStatus: (): Promise<ExchangeStatus> => {
        return get<ExchangeStatus>(KALSHI_PATHS.exchangeStatus);
    },

    /**
     * Reads the standard weekly trading hours and scheduled maintenance windows.
     *
     * @returns the exchange schedule
     * @throws {ExternalServiceError} when the request fails
     */
    getExchangeSchedule: (): Promise<GetExchangeScheduleResponse> => {
        return get<GetExchangeScheduleResponse>(KALSHI_PATHS.exchangeSchedule);
    },

    // --- Markets --------------------------------------------------------------

    /**
     * Lists markets, optionally filtered by event, series, status or timestamps.
     *
     * @param params - filters and cursor pagination options
     * @returns the matching markets and the cursor for the next page
     * @throws {ExternalServiceError} when the request fails
     */
    getMarkets: (params?: GetMarketsParams): Promise<GetMarketsResponse> => {
        return get<GetMarketsResponse>(KALSHI_PATHS.markets, params);
    },

    /**
     * Reads a single market by ticker.
     *
     * @param ticker - market ticker, e.g. `HIGHNY-24JAN01-T60`
     * @returns the market
     * @throws {ExternalServiceError} when the request fails or the market is unknown
     */
    getMarket: (ticker: string): Promise<GetMarketResponse> => {
        return get<GetMarketResponse>(KALSHI_PATHS.market(ticker));
    },

    /**
     * Reads the current order book for a market. Kalshi returns YES bids and NO
     * bids only: a YES bid at price `p` is the same as a NO ask at `1 - p`.
     *
     * @param ticker - market ticker
     * @param params - optional depth limit
     * @returns the order book price levels
     * @throws {ExternalServiceError} when the request fails
     */
    getMarketOrderbook: (ticker: string, params?: GetMarketOrderbookParams): Promise<GetMarketOrderbookResponse> => {
        return get<GetMarketOrderbookResponse>(KALSHI_PATHS.marketOrderbook(ticker), params);
    },

    /**
     * Lists completed trades across markets.
     *
     * @param params - filters and cursor pagination options
     * @returns the matching trades and the cursor for the next page
     * @throws {ExternalServiceError} when the request fails
     */
    getTrades: (params?: GetTradesParams): Promise<GetTradesResponse> => {
        return get<GetTradesResponse>(KALSHI_PATHS.trades, params);
    },

    // --- Events ---------------------------------------------------------------

    /**
     * Lists events. Multivariate (combo) events are excluded by this endpoint.
     *
     * @param params - filters and cursor pagination options
     * @returns the matching events and the cursor for the next page
     * @throws {ExternalServiceError} when the request fails
     */
    getEvents: (params?: GetEventsParams): Promise<GetEventsResponse> => {
        return get<GetEventsResponse>(KALSHI_PATHS.events, params);
    },

    /**
     * Reads a single event by ticker.
     *
     * @param eventTicker - event ticker
     * @param params - set `with_nested_markets` to include the event's markets
     * @returns the event
     * @throws {ExternalServiceError} when the request fails or the event is unknown
     */
    getEvent: (eventTicker: string, params?: GetEventParams): Promise<GetEventResponse> => {
        return get<GetEventResponse>(KALSHI_PATHS.event(eventTicker), params);
    },

    // --- Portfolio ------------------------------------------------------------

    /**
     * Reads the account balance and portfolio value.
     *
     * @param params - optional subaccount and exchange shard scoping
     * @returns the balance, in cents and as a fixed-point dollar string
     * @throws {ExternalServiceError} when the request fails
     */
    getBalance: (params?: GetBalanceParams): Promise<GetBalanceResponse> => {
        return get<GetBalanceResponse>(KALSHI_PATHS.balance, params);
    },

    /**
     * Lists open market and event positions.
     *
     * @param params - filters and cursor pagination options
     * @returns the market and event positions
     * @throws {ExternalServiceError} when the request fails
     */
    getPositions: (params?: GetPositionsParams): Promise<GetPositionsResponse> => {
        return get<GetPositionsResponse>(KALSHI_PATHS.positions, params);
    },

    /**
     * Lists fills, i.e. the individual matches that make up executed orders.
     *
     * @param params - filters and cursor pagination options
     * @returns the matching fills and the cursor for the next page
     * @throws {ExternalServiceError} when the request fails
     */
    getFills: (params?: GetFillsParams): Promise<GetFillsResponse> => {
        return get<GetFillsResponse>(KALSHI_PATHS.fills, params);
    },

    // --- Orders ---------------------------------------------------------------

    /**
     * Lists orders, optionally filtered by market, status or timestamp.
     *
     * @param params - filters and cursor pagination options
     * @returns the matching orders and the cursor for the next page
     * @throws {ExternalServiceError} when the request fails
     */
    getOrders: (params?: GetOrdersParams): Promise<GetOrdersResponse> => {
        return get<GetOrdersResponse>(KALSHI_PATHS.orders, params);
    },

    /**
     * Reads a single order by id.
     *
     * @param orderId - Kalshi order id
     * @returns the order
     * @throws {ExternalServiceError} when the request fails or the order is unknown
     */
    getOrder: (orderId: string): Promise<GetOrderResponse> => {
        return get<GetOrderResponse>(KALSHI_PATHS.order(orderId));
    },

    /**
     * Submits an order to the exchange.
     *
     * This wrapper always reaches the exchange: it does not consult `DRY_RUN`.
     * Callers in the execution path must check `config.dryRun` before invoking it.
     *
     * @param order - the order to submit, prices and counts as fixed-point strings
     * @returns the created order id together with any immediate fill
     * @throws {ExternalServiceError} when the request fails or is rejected
     */
    createOrder: async (order: CreateOrderRequest): Promise<CreateOrderResponse> => {
        const response = await kalshiHttpClient.post<CreateOrderResponse>(KALSHI_PATHS.eventOrders, order);
        return response.data;
    },

    /**
     * Cancels a resting order, reducing its remaining count to zero.
     *
     * @param orderId - Kalshi order id
     * @param params - optional subaccount, exchange shard or auto-routing ticker
     * @returns the cancelled order id and the number of contracts cancelled
     * @throws {ExternalServiceError} when the request fails or the order is unknown
     */
    cancelOrder: async (orderId: string, params?: CancelOrderParams): Promise<CancelOrderResponse> => {
        const response = await kalshiHttpClient.delete<CancelOrderResponse>(KALSHI_PATHS.eventOrder(orderId), {
            params
        });
        return response.data;
    }
};
