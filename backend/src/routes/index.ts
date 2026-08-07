import { Router } from "express";

import { healthController } from "../controller/health.controller";

export const router = Router();

router.get("/health", healthController);
