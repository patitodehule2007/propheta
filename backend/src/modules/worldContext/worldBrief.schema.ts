import { z } from "zod";

import { WORLD_BRIEF_MAX_CHARS, WORLD_BRIEF_MAX_SOURCE_URLS } from "./worldBrief.constants";

const httpUrlSchema = z.url({ protocol: /^https?$/, message: "sourceUrls must be http(s) URLs" });

/**
 * Body of `PUT /api/world-briefs/:topic`. `asOf` defaults to now; a future
 * date is rejected because staleness is measured from it.
 */
export const manualWorldBriefSchema = z.object({
    body: z.string().trim().min(1).max(WORLD_BRIEF_MAX_CHARS),
    asOf: z.iso
        .datetime({ offset: true })
        .refine((value) => new Date(value).getTime() <= Date.now(), { message: "asOf cannot be in the future" })
        .optional(),
    sourceUrls: z.array(httpUrlSchema).max(WORLD_BRIEF_MAX_SOURCE_URLS).optional()
});

export type ManualWorldBriefInput = z.infer<typeof manualWorldBriefSchema>;

/**
 * Structured output of the generation's Phase B. Fed to `zodOutputFormat`.
 */
export const generatedWorldBriefSchema = z.object({
    body: z.string().min(1),
    sourceUrls: z.array(z.string())
});

export type GeneratedWorldBrief = z.infer<typeof generatedWorldBriefSchema>;
