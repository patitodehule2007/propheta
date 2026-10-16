export const config = {
    port: Number(process.env.PORT ?? 4300),
    // Tool results carry scraped page markdown, which can run large.
    bodyLimit: process.env.BODY_LIMIT ?? "10mb"
} as const;
