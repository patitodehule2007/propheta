import { Router } from "express";

import { healthController } from "../controller/health.controller";
import { accountsRouter } from "./accounts.routes";
import { authRouter } from "./auth.routes";
import { worldBriefsRouter } from "./worldBriefs.routes";
import { xWebhookRouter } from "./xWebhook.routes";

export const router = Router();

router.get("/health", healthController);
router.use("/auth", authRouter);
router.use("/accounts", accountsRouter);
router.use("/world-briefs", worldBriefsRouter);
router.use("/webhooks/x", xWebhookRouter);
