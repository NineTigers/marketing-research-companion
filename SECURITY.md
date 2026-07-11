# Security

## Supported deployment

The supported production shape is one local installation for one operating-system user. The
server binds to `127.0.0.1` by default. Use an authenticated SSH tunnel when viewing it from a
different device. Direct public-internet exposure is unsupported.

## Authentication

The application starts the local Codex App Server and requests its managed ChatGPT login flow. It
does not read, copy, log, or store ChatGPT access tokens. Codex stores and refreshes credentials in
its configured OS credential store or `~/.codex` location.

Logging out in this application logs the local Codex installation out. This can also affect Codex
CLI and IDE sessions that share the same credential cache.

## Data

Research requests may contain customer reviews, interviews, and internal product plans. Jobs and
reports are stored under `.data` with owner-only file permissions where supported. Do not enter
personal data without an approved retention policy. Delete `.data` before transferring a device or
sharing a project copy.

## Network boundary

Do not bind the built-in server to a public interface. A centralized or multi-tenant deployment
requires a separate identity layer, tenant isolation, encrypted storage, rate limiting, audit logs,
and a security review; those controls are intentionally outside this local companion product.

## Web updates

The web updater accepts only the official `NineTigers/marketing-research-companion` origin, the
`main` branch, a clean tracked worktree, and a fast-forward merge. It does not execute shell text,
force-reset local files, or update while research jobs are running. Diverged histories and local
tracked changes require manual review. Keep the repository origin under the intended GitHub account;
changing that remote changes the software supply source and disables the built-in updater.

Report vulnerabilities privately to the repository owner. Never include Codex credentials,
customer data, or unpublished product information in a public issue.
