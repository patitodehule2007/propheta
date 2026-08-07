import { Router } from "express";

import { healthController } from "../controller/health.controller";
import { xWebhookRouter } from "./xWebhook.routes";

export const router = Router();

router.get("/health", healthController);
router.use("/webhooks/x", xWebhookRouter);
