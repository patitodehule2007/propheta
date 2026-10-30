import { Router } from "express";

import {
    listBriefHistory,
    listLatestBriefs,
    postGenerateBrief,
    putManualBrief
} from "../controller/worldBriefs.controller";
import { authMiddleware } from "../shared/middleware/authMiddleware";

export const worldBriefsRouter = Router();

worldBriefsRouter.use(authMiddleware);

worldBriefsRouter.get("/", listLatestBriefs);
worldBriefsRouter.get("/:topic/history", listBriefHistory);
worldBriefsRouter.put("/:topic", putManualBrief);
worldBriefsRouter.post("/:topic/generate", postGenerateBrief);
