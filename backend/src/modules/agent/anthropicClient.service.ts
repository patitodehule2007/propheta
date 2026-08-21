import Anthropic from "@anthropic-ai/sdk";

import { config } from "../../config";

/**
 * Shared Anthropic client. `baseURL` is only set when `ANTHROPIC_BASE_URL` is
 * configured — tests point it at `mocks/anthropic-mock`, the same seam
 * `X_API_BASE_URL` provides for the X API client. Undefined lets the SDK use
 * its own default.
 */
export const anthropicClient = new Anthropic({
    apiKey: config.anthropic.apiKey,
    baseURL: config.anthropic.baseUrl
});
