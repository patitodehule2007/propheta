import { Router } from "express";

import { crcChallenge, listDecisions, receiveWebhookEvent, registerWebhook } from "../controller/xWebhook.controller";

export const xWebhookRouter = Router();

xWebhookRouter.get("/", crcChallenge);
xWebhookRouter.post("/", receiveWebhookEvent);
xWebhookRouter.get("/decisions", listDecisions);
xWebhookRouter.post("/registration", registerWebhook);
