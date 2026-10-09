# Manual API requests

[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
request files for poking the dev stack by hand. They are not tests. Automated
coverage lives in `tests/jest/`.

## Setup

1. Install the REST Client extension (VSCode suggests it from
   `.vscode/extensions.json`).
2. Copy `.env.example` to `.env` in this folder and fill in the admin
   credentials (same as `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the root `.env`).
   REST Client only reads a `.env` next to the `.http` file.
3. Start the stack: `docker compose up --build`.

`baseUrl` and `mockUrl` come from `rest-client.environmentVariables.$shared`
in `.vscode/settings.json`. Click **Send Request** above any request.

## Files

| File              | Covers                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| `auth.http`       | Login, current user, refresh, logout. Cookies persist across all files.   |
| `accounts.http`   | List, add and remove monitored accounts (requires login).                 |
| `webhooks.http`   | Health, webhook registration, CRC challenge, decision log.                |
| `x-api-mock.http` | Mock state (users, webhooks, subscriptions) and `/mock/simulate-post`.    |

## Triggering the pipeline with a post

1. `auth.http`: **Login**.
2. `webhooks.http`: **Register the webhook**. Check that `valid` is `true`.
   The mock keeps webhooks in memory, so repeat this after `x-api-mock`
   restarts.
3. `x-api-mock.http`: send one of the **Simulate a post** requests. The mock
   signs a `post.create` event and delivers it to the backend; the response
   includes `postId` and the backend's `deliveryStatus`.
4. Send the **Decisions for ... post above** request right below it to see how
   far the post got through the pipeline.

Sending the same author + topic + direction again within
`TRADE_NOVELTY_WINDOW_HOURS` ends in `no_novelty`. Rotate accounts or change
the text.
