import { IngestedPost, insertDecisionLog } from "../../repositories/postgres/ingestion.repository";
import { Decision, PipelineStage } from "../../shared/core/decisionLog.constants";
import { logger } from "../../shared/services/logger";
import { receiveEvent } from "../ingestion/ingestion.service";
import { PostCreateEvent } from "../ingestion/xWebhook.schema";
import { extractUrls, parseUrlsToMarkdown } from "../scraping/scrape.service";
import { ScrapedLink } from "../scraping/scrape.constants";

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
        stage: PipelineStage.LINKS_ENRICHED,
        decision: Decision.ENRICHED,
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
 * Runs one `post.create` delivery through the decision pipeline.
 *
 * Each stage reports its outcome and this coordinator decides whether the flow
 * continues, so a post dropped at ingestion never reaches enrichment. Stages
 * after enrichment (classification, market matching, risk validation, order
 * execution) are not implemented — nothing here sends orders.
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

    if (ingestion.status === Decision.DISCARDED) {
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
}
