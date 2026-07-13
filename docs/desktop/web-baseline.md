# Desktop conversion baseline

## Fixed inputs

- Product: Marketing Research Companion (`marketing-research-companion`)
- Web baseline: `61580fb8115b8fbccac885d9fd0085ab941c4b85`
- Core capability: source-backed marketing research, VOC analysis, deterministic commercial estimates, and executive HTML reports
- First useful result: one persisted and reopenable marketing decision report
- First platform: macOS arm64
- Application id: `com.ninetigers.marketing-research-companion`
- Provider and auth: Codex App Server with Codex-managed ChatGPT authentication
- Model policy: `gpt-5.6-terra/high`, then `gpt-5.5/high`; no unlisted fallback
- Runtime policy: discover an installed supported Codex runtime first; do not bundle a Codex binary
- Packaging target: unsigned development `.dmg` and `.zip`
- Customer update scope: deferred; desktop packages do not call the Git fast-forward updater
- User data: the macOS application-support directory, outside the app bundle and source checkout

Signed distribution, notarization, bundled Codex binaries, automatic prerequisite installation, Windows,
Linux, and customer auto-update are separate release decisions.

## Reproduced web journey

The fixed baseline was started on `127.0.0.1:62800` with isolated demo data. `/api/health`
reported version `3.2.0`; a VOC product-development request completed as
`RSH-20260713-E9BS`, persisted its job and report, and reopened through the report API.
The demo warning remained visible and was not represented as a live Provider result.

Current web journey:

1. Run the Node server.
2. Open the printed localhost URL.
3. Reuse an existing Codex ChatGPT login or start browser login.
4. Submit a research brief, monitor stages, and open the persisted report.
5. Restart the service and reopen stored jobs and reports.

## Experience difference table

| Surface | Classification | Desktop contract |
| --- | --- | --- |
| Research intake, jobs, reports, charts, quality views | exact | Reuse the existing web UI and APIs. |
| Codex App Server, ChatGPT-managed auth, model order | exact | The desktop host starts the same runtime adapter; no token ownership change. |
| Jobs, reports, images, UI state | exact | Preserve schemas and storage behavior in OS user data. |
| Start experience | adapted | App icon starts the host, product server, and Codex runtime; no terminal or URL copy. |
| Browser use | adapted | Only approved ChatGPT/OpenAI login URLs open in the system browser. |
| Report windows | adapted | Same-origin reports open in a hardened product window. |
| Loopback access | required_exception | Desktop requests carry a host-only session capability header. |
| Git self-update | required_exception | Disabled in packaged desktop builds; package update design is deferred. |
| Codex runtime installation | deferred_experiment | Discover-first only; missing runtime is diagnosed, not installed silently. |
| Signed and notarized release | deferred_experiment | This build is an unsigned development installer. |

The desktop experiment changes delivery form only. It does not change research prompts, evidence
rules, calculations, report schema, selected models, user-data meaning, or business UI structure.
