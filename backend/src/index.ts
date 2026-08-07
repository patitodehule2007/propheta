import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";

import { config } from "./config";
import { router } from "./routes";
import { errorMiddleware } from "./shared/middleware/error.middleware";
import { logger } from "./shared/services/logger";

const app = express();

app.use(compression());
app.use(cookieParser());
app.use(express.json());
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
});
