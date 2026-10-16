# anthropic-manual-relay (temporary)

Lets you run the decision pipeline without an Anthropic API key. The backend
sends its normal Claude API calls here. Each call is held open and shown to you
as a single prompt. You paste it into a regular Claude chat, paste the answer
back, and the relay returns that answer to the backend as an API response.

This is a test harness only and is meant to be deleted. The backend has no
code changes for it: it uses the existing `ANTHROPIC_BASE_URL` override.

## Prerequisites

- VS Code with the REST Client extension (the same setup as the other files in
  `scripts/http/`, see `scripts/http/README.md`).

## Step by step

1. **Start the stack with the relay override:**

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.manual-llm.yml up --build
   ```

   This points the backend at the relay and sets a placeholder
   `ANTHROPIC_API_KEY`. Any real key in `.env` is overridden and never sent.

2. **Trigger a post.** Follow "Triggering the pipeline with a post" in
   `scripts/http/README.md`: log in, register the webhook, simulate a post.

3. **Fetch the prompt.** Open `scripts/http/manual-llm.http` and send
   request **1**. The response body is the full prompt.
   - `204 No Content` means nothing is waiting yet. Wait a second and resend.
   - The `X-Pending-Count` header shows how many prompts are queued.

4. **Ask Claude.** Copy the whole response body into a **new** Claude chat.
   Use a fresh chat every time: each prompt already contains the full
   conversation so far, exactly as the API would receive it.

5. **Paste the answer.** Copy Claude's reply into
   `scripts/http/manual-llm-reply.txt`, replacing what was there. The file is
   gitignored.

6. **Send it.** Send request **2** in `manual-llm.http`.
   - `200 Delivered (stop_reason: tool_use)` means Claude called a tool. The
     backend runs it and sends the next call. Go back to step 3.
   - `200 Delivered (stop_reason: end_turn)` means that stage is done. The
     backend may still send another call, so go back to step 3.
   - `400` means the reply could not be read (bad JSON, unknown tool). Fix the
     reply file and send request 2 again. The prompt stays pending.
   - `410` means the backend stopped waiting. See the time limit below.

7. **Repeat until request 1 returns `204`.** Then check the result with the
   decision log requests in `scripts/http/webhooks.http`.

## How many rounds to expect

Each API call is one paste round. For a post with a link:

- Classification takes about 3–4 rounds: an investigation turn or two with
  tool calls (`search_tools`, `parse_url`), a closing turn, and then a
  structured JSON classification.
- If the post passes the gates before selection, the selection agent adds
  another 2–3 rounds and ends with a structured JSON trade proposal.

The prompt tells Claude which kind of reply it wants. For tool turns, Claude
replies with ```` ```tool_call ```` blocks or plain text. For structured
turns, it replies with JSON only, following the schema in the prompt.

## Limits

- **Time limit.** The SDK times out after 10 minutes and retries twice. A retry
  attaches to the same pending prompt, so you get about 30 minutes in total per
  prompt before the backend gives up (and then you get `410`).
- **No `web_fetch`.** It is a server-side tool that Anthropic's API runs, so it
  is not offered to the model. `parse_url` covers links.
- **Not the configured model.** Answers come from whatever model the chat uses,
  not from `ANTHROPIC_MODEL`. The relay is for checking the framework (the
  prompts, tool loop, schemas and gates), not answer quality.
- **The JSON schema is not checked here.** The relay only checks that a
  structured reply is valid JSON. The backend's zod schema validates the shape,
  so a wrong-shaped answer goes through the real failure path.
- **State lives in memory.** Restarting the relay drops pending prompts.

## Removing it

Delete:

- `mocks/anthropic-manual-relay/`
- `docker-compose.manual-llm.yml`
- `scripts/http/manual-llm.http` and `scripts/http/manual-llm-reply.txt`
- the `manual-llm-reply.txt` lines in the root `.gitignore`
- the "Manual relay" paragraph in `docs/backend/agent.md`
