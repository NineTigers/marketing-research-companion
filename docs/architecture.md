# Architecture

## Product boundary

This repository is the complete product source for Marketing Research Companion. Runtime code does
not import Workbench, packs, skills, another product, or files from an authoring `asset` directory.
The user's Codex installation owns ChatGPT authentication. This application owns research jobs,
quality checks, reports, product images, and its localhost service.

## Runtime

- `server.mjs`: localhost HTTP boundary, OAuth proxy, job lifecycle, assets, reports, and updates.
- `lib/codex-runtime.mjs`: Codex app-server adapter using the current user's ChatGPT account.
- `lib/provider.mjs`: live structured research and deterministic demo providers.
- `lib/workflow.mjs`: research stages, deterministic recalculation, visual pairing, and review flow.
- `lib/report-schema.mjs`: strict source, competitor, VOC, commercial, and task-outcome contracts.
- `lib/commercial-calculator.mjs`: deterministic sales backcasts from declared evidence inputs.
- `lib/product-images.mjs`: bounded official-page image retrieval and local asset caching.
- `lib/storage.mjs`: atomic jobs, reports, assets, UI state, and interrupted-job recovery.
- `lib/report-renderer.mjs`: escaped executive HTML with source-linked sections.
- `lib/updater.mjs`: clean fast-forward updates from the official repository only.

## Persistence

Source and user data have separate lifecycles. By default, data is stored under:

- macOS: `~/Library/Application Support/NineTigers/MarketingResearchCompanion`
- Windows: `%APPDATA%/NineTigers/MarketingResearchCompanion`
- Linux: `$XDG_DATA_HOME/ninetigers/marketing-research-companion` or `~/.local/share/...`

`DATA_DIR` can override this location. The managed service records and reuses the resolved path.
Git updates never replace the data directory.

## Decision and quality flow

The report contract places recommendation, requested approval, and confidence before supporting
analysis. Sources have stable references; competitor sales are recalculated from declared inputs;
VOC includes channels, periods, counts, and shares. Strategy checks decision usefulness and Teacher
checks contract completeness before persistence. Warnings remain visible in the report and job.

## Release boundary

The public repository is the release source. CI runs `npm test` and `npm run check`. There is no
authoring-to-`dist` export step. Managed services use the checked-out `server.mjs`, while persistent
data and logs remain outside the checkout.
