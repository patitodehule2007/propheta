import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";

import { config } from "./config";
import { refreshMarketCache, startMarketCacheRefresh } from "./modules/trading/marketCache.service";
import { startExitSupervisor } from "./modules/trading/exitSupervisor.service";
import { startQuotePoller } from "./modules/trading/quotePoller.service";
import { router } from "./routes";
import { errorMiddleware } from "./shared/middleware/error.middleware";
import { logger } from "./shared/services/logger";

const app = express();

app.use(compression());
app.use(cookieParser());
app.use(
    express.json({
        verify: (req, _res, buf) => {
            (req as express.Request).rawBody = Buffer.from(buf);
        }
    })
);
app.use(
    cors({
        origin: config.cors.allowedOrigins,
        credentials: true
    })
);

app.use("/api", router);

app.use(errorMiddleware);

app.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, env: config.env }, "Backend listening");

    void refreshMarketCache().catch((err) => {
        logger.error({ err }, "Initial market cache refresh failed");
    });
    startMarketCacheRefresh();
    startQuotePoller();
    startExitSupervisor();
});
