import { z } from "zod";

/**
 * Shape of the `post.create` event delivered to the webhook. Matches what
 * `mocks/x-api-mock` sends; kept intentionally small for the ingestion-only
 * slice built in this round.
 */
export const postCreateEventSchema = z.object({
    event_type: z.literal("post.create"),
    data: z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        author_id: z.string().min(1),
        created_at: z.string().min(1)
    })
});

export type PostCreateEvent = z.infer<typeof postCreateEventSchema>;
