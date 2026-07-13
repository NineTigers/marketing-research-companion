# Codex App Server contract

## Verified source

- Installed Codex: `codex-cli 0.144.2`
- Generated command: `codex app-server generate-json-schema --out <temporary-review-path>`
- Generated v2 schema SHA-256: `1730f916ee3e4c85816ce611e4564a9f30dc50136c59e6366176ef3fe57d2f63`
- Official reference: `https://learn.chatgpt.com/docs/app-server`
- Reviewed: 2026-07-13

The generated schema is version-specific review evidence and is not bundled into the customer app.
The runtime adapter uses newline-delimited JSON over the supported `stdio` transport.

## Used protocol

1. Start `codex app-server --listen stdio://` as a managed child process.
2. Send one `initialize` request with product client metadata.
3. Send the `initialized` notification.
4. Read `account/read`; reuse only a `chatgpt` account for product research.
5. Start managed browser login with `account/login/start` using `type: chatgpt`, hosted success, and ChatGPT branding.
6. Observe `account/login/completed` and `account/updated`; the UI also refreshes account state.
7. Allow explicit cancellation with `account/login/cancel`.
8. Use `account/logout` only after a visible warning that shared Codex sessions are affected.
9. Read `model/list` and Provider capabilities; select the first approved model only.
10. Execute the existing `thread/start` and `turn/start` product workflow and persist model and effort.

ChatGPT OAuth tokens remain owned by Codex. They are never copied into Electron storage, renderer
state, application data, logs, reports, or telemetry.
