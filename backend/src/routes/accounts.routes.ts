import { Router } from "express";

import { createAccount, deleteAccount, listAccounts } from "../controller/accounts.controller";
import { authMiddleware } from "../shared/middleware/authMiddleware";

export const accountsRouter = Router();

accountsRouter.use(authMiddleware);

accountsRouter.get("/", listAccounts);
accountsRouter.post("/", createAccount);
accountsRouter.delete("/:id", deleteAccount);
