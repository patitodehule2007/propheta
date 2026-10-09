import { Router } from "express";

import { crcChallenge, listDecisions, receiveWebhookEvent, registerWebhook } from "../controller/xWebhook.controller";
import { authMiddleware } from "../shared/middleware/authMiddleware";

export const xWebhookRouter = Router();

xWebhookRouter.get("/", crcChallenge);
xWebhookRouter.post("/", receiveWebhookEvent);
xWebhookRouter.get("/decisions", authMiddleware, listDecisions);
xWebhookRouter.post("/registration", authMiddleware, registerWebhook);
