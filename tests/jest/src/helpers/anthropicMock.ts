export const ANTHROPIC_MOCK_URL = process.env.ANTHROPIC_BASE_URL ?? "http://anthropic-mock-test:4200";

// Distinguishes the selection agent's and world-brief calls from the
// classifier's: each stage sends its own system prompt.
const SELECTION_STAGE_MARKER = "market-selection stage";
const WORLD_BRIEF_STAGE_MARKER = "world-brief stage of Propheta";

/** One `/v1/messages` call as anthropic-mock recorded it. */
export interface CapturedRequest {
    system: unknown;
    firstUserContent: string;
    hasOutputConfig: boolean;
}

/**
 * Reads the `/v1/messages` calls anthropic-mock recorded whose first user
 * message contains `contains` (a test's unique post marker), oldest first.
 * @param contains - text the prompt must contain
 * @returns the matching captured requests
 * @throws {Error} when the mock rejects the request
 */
export async function getCapturedRequests(contains: string): Promise<CapturedRequest[]> {
    const response = await fetch(`${ANTHROPIC_MOCK_URL}/mock/requests?contains=${encodeURIComponent(contains)}`);
    if (!response.ok) {
        throw new Error(`anthropic-mock GET /mock/requests failed with status ${response.status}`);
    }
    const body = (await response.json()) as { data: CapturedRequest[] };
    return body.data;
}

const CANDIDATE_TICKER_REGEX = /"ticker":"([^"]+)"/g;

/**
 * Candidate tickers in the order the selection agent was shown them, for the
 * post carrying `contains`.
 * @param contains - the post's unique text
 * @returns tickers from the `<candidate_markets>` table, in prompt order
 * @throws {Error} when no selection-stage call for that post was captured
 */
export async function getSelectionCandidateTickers(contains: string): Promise<string[]> {
    const requests = await getCapturedRequests(contains);
    const selectionCall = requests.find(
        (request) => typeof request.system === "string" && request.system.includes(SELECTION_STAGE_MARKER)
    );
    if (!selectionCall) {
        throw new Error(`No selection-stage request captured for "${contains}"`);
    }
    return Array.from(selectionCall.firstUserContent.matchAll(CANDIDATE_TICKER_REGEX), (match) => match[1]);
}

/**
 * The classifier's first-turn prompt for the post carrying `contains`.
 * @param contains - the post's unique marker
 * @returns the prompt text
 * @throws {Error} when no classifier call for that post was captured
 */
export async function getClassifierPrompt(contains: string): Promise<string> {
    const requests = await getCapturedRequests(contains);
    const classifierCall = requests.find(
        (request) =>
            typeof request.system === "string" &&
            !request.system.includes(SELECTION_STAGE_MARKER) &&
            !request.system.includes(WORLD_BRIEF_STAGE_MARKER)
    );
    if (!classifierCall) {
        throw new Error(`No classifier request captured for "${contains}"`);
    }
    return classifierCall.firstUserContent;
}
