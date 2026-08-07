export const config = {
    port: Number(process.env.PORT ?? 4100),
    webhookConsumerSecret: process.env.X_WEBHOOK_CONSUMER_SECRET ?? ""
} as const;
