import { randomUUID } from "crypto";
import express, { Request, Response } from "express";

import { config } from "./config";
import { findPending, oldestPending, pendingCount, removePending, trackRequest } from "./pending";
import { buildAssistantTurn, ReplyFormatError } from "./reply";
import { AssistantTurn, MessagesRequest } from "./types";

const DEFAULT_MODEL = "manual-relay";

const app = express();
app.use(express.json({ limit: config.bodyLimit }));

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// --- Backend side: hold each /v1/messages call until a human answers ------

app.post("/v1/messages", (req: Request, res: Response) => {
    const { entry, isRetry } = trackRequest(req.body as MessagesRequest, res);
    res.on("close", () => entry.waiters.delete(res));

    if (isRetry) {
        console.log(`[relay] SDK retry attached to pending request ${entry.id}`);
        return;
    }
    console.log(`\n[relay] new pending request ${entry.id} (${pendingCount()} pending)\n${entry.prompt}\n`);
});

// --- Human side: driven from scripts/http/manual-llm.http ----------------

app.get("/pending", (_req: Request, res: Response) => {
    const entry = oldestPending();
    if (!entry) {
        res.status(204).end();
        return;
    }
    res.set("X-Request-Id", entry.id).set("X-Pending-Count", String(pendingCount()));
    res.status(200).type("text/plain").send(entry.prompt);
});

app.post("/reply/:id", express.text({ type: "*/*", limit: config.bodyLimit }), (req: Request, res: Response) => {
    const id = String(req.params.id);
    const entry = findPending(id);
    if (!entry) {
        res.status(404).type("text/plain").send(`No pending request with id ${id}.`);
        return;
    }

    let turn: AssistantTurn;
    try {
        turn = buildAssistantTurn(typeof req.body === "string" ? req.body : "", entry.request);
    } catch (err) {
        if (!(err instanceof ReplyFormatError)) throw err;
        res.status(400).type("text/plain").send(`${err.message}\nFix the reply file and send again.`);
        return;
    }

    removePending(id);
    if (entry.waiters.size === 0) {
        res.status(410).type("text/plain").send("The backend stopped waiting for this request; it was dropped.");
        return;
    }

    const message = toMessageResponse(entry.request.model ?? DEFAULT_MODEL, turn);
    entry.waiters.forEach((waiter) => waiter.status(200).json(message));
    res.status(200)
        .type("text/plain")
        .send(`Delivered (stop_reason: ${turn.stopReason}). ${pendingCount()} still pending.`);
});

function toMessageResponse(model: string, turn: AssistantTurn) {
    return {
        id: `msg_${randomUUID()}`,
        type: "message",
        role: "assistant",
        model,
        content: turn.content,
        stop_reason: turn.stopReason,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
    };
}

app.listen(config.port, "0.0.0.0", () => {
    console.log(`anthropic-manual-relay listening on ${config.port}`);
});
