import { IngestedPost, insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import { DecisionOutcome, DecisionStage } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import { runPostAnalysis } from "../agent/agent.service";
import { receiveEvent } from "../ingestion/ingestion.service";
import { PostCreateEvent } from "../ingestion/xWebhook.schema";
import { extractUrls, parseUrlsToMarkdown } from "../scraping/scrape.service";
import { ScrapedLink } from "../scraping/scrape.constants";
import { runTradeDecision } from "../trading/tradeDecision.service";

/**
 * Scrapes the links a post carries and records the attempt in the audit trail.
 *
 * A post's own text is usually too thin to decide on; when it links out, the
 * linked page is the actual signal. Scraping failures never propagate — a post
 * with three links where one is dead still yields the two that worked.
 *
 * @param post The post accepted by the ingestion stage.
 * @returns The markdown scraped from each link that yielded content.
 */
async function enrichLinks(post: IngestedPost): Promise<ScrapedLink[]> {
    const urlsFound = extractUrls(post.rawText);
    if (urlsFound.length === 0) return [];

    const scrapedLinks = await parseUrlsToMarkdown(post.rawText);

    // The markdown itself is not stored: it can run to megabytes and
    // decision_log is an audit trail, not a content store. Persisting it needs
    // its own table, which lands with the classification stage.
    await insertDecisionLog({
        ingestedPostId: post.id,
        platformPostId: post.platformPostId,
        stage: DecisionStage.LINKS_ENRICHED,
        decision: DecisionOutcome.ENRICHED,
        reason: null,
        metadata: {
            urlsFound: urlsFound.length,
            urlsScraped: scrapedLinks.length,
            sources: scrapedLinks.map((link) => ({ url: link.url, markdownLength: link.markdown.length }))
        }
    });

    return scrapedLinks;
}

/**
 * Runs classification and, when it produces a classification, the trade
 * decision gates after it. Fire-and-forget from `runPipeline`: both stages
 * together can run 10-60s (see `docs/backend/agent.md`, "Known gap"), far
 * longer than a webhook response should block for. Never throws — each stage
 * writes its own `decision_log` row and is individually resilient.
 */
async function runPostPipeline(post: IngestedPost, handle: string): Promise<void> {
    const classification = await runPostAnalysis({
        ingestedPostId: post.id,
        platformPostId: post.platformPostId,
        text: post.rawText
    });

    if (!classification) return;

    await runTradeDecision({ post, handle, classification });
}

/**
 * Runs one `post.create` delivery through the decision pipeline.
 *
 * Each stage reports its outcome and this coordinator decides whether the flow
 * continues, so a post dropped at ingestion never reaches enrichment. Classification
 * and the trade-decision gates run after enrichment but are not awaited here — see
 * `runPostPipeline`.
 *
 * @param rawBody Exact request body bytes, required for signature verification.
 * @param signatureHeader Value of the `x-twitter-webhooks-signature` header.
 * @param event Parsed and schema-validated event payload.
 * @throws {AuthenticationError} When the signature is missing or invalid.
 */
export async function runPipeline(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    event: PostCreateEvent
): Promise<void> {
    const ingestion = await receiveEvent(rawBody, signatureHeader, event);

    if (ingestion.status === DecisionOutcome.DISCARDED) {
        logger.info({ platformPostId: event.data.id, reason: ingestion.reason }, "Pipeline stopped at ingestion");
        return;
    }

    const scrapedLinks = await enrichLinks(ingestion.post);

    logger.info(
        {
            platformPostId: ingestion.post.platformPostId,
            handle: ingestion.account.handle,
            scrapedLinks: scrapedLinks.length
        },
        "Post ingested and enriched"
    );

    void runPostPipeline(ingestion.post, ingestion.account.handle).catch((err) => {
        logger.error({ err, platformPostId: ingestion.post.platformPostId }, "Post pipeline failed after enrichment");
    });
}
