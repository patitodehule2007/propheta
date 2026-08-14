import { Router } from "express";

import { loginController, logoutController, meController, refreshController } from "../controller/auth.controller";
import { authMiddleware } from "../shared/middleware/authMiddleware";

export const authRouter = Router();

authRouter.post("/login", loginController);
authRouter.post("/refresh", refreshController);
authRouter.post("/logout", logoutController);
authRouter.get("/me", authMiddleware, meController);
