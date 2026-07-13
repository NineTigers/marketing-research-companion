# macOS arm64 development-installer acceptance

Status: `DEVELOPMENT_INSTALLER_READY`

This status means the unsigned installer is suitable for internal installation and product-form
validation. It does not mean signed customer release readiness.

## Build inputs

- Reviewed: 2026-07-13
- Host: Apple Silicon macOS 26.4.1
- Application: Marketing Research Companion 3.3.0
- Application id: `com.ninetigers.marketing-research-companion`
- Electron: 43.1.0
- electron-builder: 26.15.3
- Codex discovered for the runtime check: `codex-cli 0.144.2`
- Node requirement for source builds: 22.12 or later

## Automated product journey

Both source Electron and the app mounted from the final DMG completed the same isolated demo
journey:

1. The desktop host selected an available loopback port and loaded the existing product UI.
2. The renderer reported both `window.process` and `window.require` as `undefined`.
3. `/api/config` reported `distribution=desktop` and `selfUpdate=false`.
4. A VOC product-development request completed as `completed_with_warnings`, preserving the visible
   demo-data limitation.
5. The generated executive report reopened successfully.
6. UI state persisted to external user data.
7. A second launch with the same user-data directory retained the first job and created the second
   job (`1 -> 2` stored job records).
8. App exit released the selected port and left no app-owned Electron or Codex child process.

The packaged live-runtime check did not execute a research turn or consume account quota. It
confirmed that the app discovered the installed Codex binary, started
`codex app-server --listen stdio://` as its child, and terminated that child on exit.

## Security checks

- A request to the desktop loopback URL without the host-only session header returned HTTP 403.
- Renderer sandbox, context isolation, and disabled Node integration are fixed in the host.
- Product navigation is same-origin; external HTTPS links use the system browser.
- ChatGPT login URLs are accepted only under approved OpenAI or ChatGPT domains.
- Permission requests are denied except same-origin sanitized clipboard writes.
- Only same-origin JSON blob exports may download.
- ASAR inspection found no user home path, Workbench/pack dependency, `.env` file, API key, or token.
- macOS ATS has arbitrary loads disabled and only localhost HTTP exceptions enabled.
- The packaged source updater is disabled; the app bundle is not modified with Git.
- Gatekeeper assessment rejects this build as expected because it has no Developer ID signature or
  notarization; it must not be represented as a customer production installer.

## Artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Marketing Research Companion-3.3.0-arm64.dmg` | 119,444,785 | `e83f1fdea27d18d330d2a10f549ded09a12232670265f51f8eb0c1e79271f725` |
| `Marketing Research Companion-3.3.0-arm64.zip` | 119,514,488 | `ed5f7f92ad9c73142428450b934f250578eb71b9cade145973e84b97825d695f` |

The app executable is a thin arm64 Mach-O. The ASAR integrity hash embedded in Info.plist is
`c7f809f0be01e32e1d4804da24415e643e9e1d598349caeffd1b0bcd5ddd9072`.

## Remaining release gates

- Run one explicitly authorized real Provider research turn and confirm account attribution,
  citations, report persistence, and relaunch reopening before declaring
  `AUTHENTICATED_ACCEPTANCE_READY`.
- Sign with the intended Developer ID, enable the approved hardened-runtime entitlements, notarize,
  staple, and verify Gatekeeper before declaring `SIGNED_RELEASE_READY`.
- Configure and review a signed package update channel before enabling customer auto-update.
- Repeat the golden journey on the declared minimum supported macOS version.
