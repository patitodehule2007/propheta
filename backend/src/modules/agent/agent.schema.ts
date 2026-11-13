import { z } from "zod";

import { AgentDirection, AgentTopic } from "./agent.constants";

const topicValues = Object.values(AgentTopic) as [AgentTopic, ...AgentTopic[]];
const directionValues = Object.values(AgentDirection) as [AgentDirection, ...AgentDirection[]];

/**
 * Structured output of the classification phase (§7.2 decision log spec).
 * Fed to `zodOutputFormat` so the model's response is validated against this
 * shape before it reaches `decision_log.metadata`.
 *
 * Field order is deliberate: structured output is generated in schema order,
 * so the written reasoning and the chosen event come before the verdict
 * fields that depend on them.
 */
export const postClassificationSchema = z.object({
    summary: z.string().min(1),
    reasoning: z.string().min(1),
    sourceUrls: z.array(z.string()),
    targetEvent: z.string().min(1),
    targetSeries: z.array(z.string()),
    topic: z.enum(topicValues),
    direction: z.enum(directionValues),
    confidence: z.number().min(0).max(1)
});

export type PostClassification = z.infer<typeof postClassificationSchema>;
