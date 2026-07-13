# ADR-001: Electron desktop host

Status: accepted for the macOS arm64 development installer.

## Decision

Use Electron as a thin, hardened desktop host around the existing local Node product server. The
host owns process lifetime, single-instance behavior, the product window, approved external browser
opening, and the loopback session capability. The renderer receives no Node or filesystem access.

## Candidate comparison

| Criterion | Electron | Tauri | Native macOS shell |
| --- | --- | --- | --- |
| Existing HTML and Node server reuse | Highest | UI reusable; Node server becomes a sidecar | UI and host largely rewritten |
| Codex stdio child process | Native Node child process path already exists | Rust command/sidecar bridge required | Swift process bridge required |
| System browser OAuth | Mature `shell.openExternal` and navigation hooks | Supported through plugins | Supported natively |
| Restricted renderer boundary | Context isolation, sandbox, no Node integration | Strong WebView command allowlist | Strong native boundary |
| Build prerequisites here | Node only | Rust toolchain is absent | Xcode and Swift-specific implementation |
| Package size and idle memory | Largest | Smallest | Smallest |
| Cross-platform follow-up | Direct | Direct after sidecar work | Separate implementation per OS |
| Baseline disruption | Lowest | Medium | Highest |

Electron's package size is accepted for this experiment because preserving the verified product and
auth path is more important than minimizing installer size. Tauri becomes preferable only after a
reviewed native-sidecar contract replaces the Node host without changing the product journey.

## Security constraints

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, no preload bridge.
- One application instance; later launches focus the existing product window.
- Product HTTP server binds to loopback and requires a random session header in desktop mode.
- The Electron session injects the header; renderer JavaScript never receives the token.
- Navigation is same-origin only. Approved ChatGPT/OpenAI authentication URLs open externally.
- WebViews, permission requests, downloads, unknown protocols, and arbitrary new windows are denied.
- Product and Codex processes are closed when the app exits; shared ChatGPT authentication is not logged out.
- User data and the writable Codex workspace live under the OS application-support directory.
- Packaged builds disable the source-checkout Git updater.

## Consequences

The installer includes Electron and is unsigned until signing authority is supplied. Codex is not
bundled; a compatible installed runtime is discovered and started by the app. Customer updates must
later use signed package releases rather than the web product's Git updater.
