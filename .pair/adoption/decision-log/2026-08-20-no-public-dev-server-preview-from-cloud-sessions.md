# Decision: No public dev-server preview from cloud coding sessions

## Date

2026-08-20

## Status

Active

## Category

Process Decision

## Context

A cloud coding environment (Claude Code Web and similar) clones a repository into an isolated VM
and runs the same skills a local session does. Story #225 (verifying and documenting pair on
Claude Code Web) needed a decision on the one capability that genuinely differs from a local
session: whether a dev server started inside that VM should be reachable from the developer's own
browser, so they can click through the running app the way they do locally.

Two independent facts push toward the same answer. The environment's own side: these sessions run
in isolated VMs whose network access is limited by default — nothing publishes a port to the public
internet without a deliberate tunnel or proxy. pair's side: even where a host offered a
port-forwarding mechanism, wiring pair into it would mean pair itself decides that an ad-hoc
`pnpm dev` becomes reachable from outside the sandbox.

## Decision

**pair does not tunnel around the sandbox's network isolation.** No reverse proxy, no
port-sharing service, documented or scripted, ships as part of pair's web/cloud support. A dev
server started inside a cloud session stays reachable only from **inside** that session.

This is treated as an intentional exclusion, not a gap to close later: a port anyone can reach
turns every ad-hoc `pnpm dev` into an unauthenticated public deployment of unreviewed code, running
from a sandbox that already holds the repository's credentials (git identity, GitHub access). The
blast radius of getting that wrong — a stray public URL serving whatever is on a feature branch,
authenticated with the same identity that can push to the repo — is not proportional to the
convenience of a live click-through preview.

The documented mitigation is to drive the app **headlessly, from inside the session**: a headless
browser (Playwright, already in pair's stack) can reach `localhost` because it runs in the same
sandbox, and can capture a screenshot as evidence that a layout renders or a regression is visible
— enough to confirm the app works, not enough to click around. See
[Web and Cloud Environments](https://pair.foomakers.com/docs/integrations/web-cloud-environments) for the
verified command sequence.

## Alternatives Considered

- **Build a port-forwarding/tunnel integration** (e.g. an ngrok-style reverse proxy pair configures
  automatically): rejected — it would make pair itself responsible for exposing a sandboxed VM's
  ports to the public internet, and every session would need its own authentication and expiry
  story to avoid becoming an open door into a live coding environment.
- **Ask the platform for a preview-URL feature and wait**: rejected as the default answer — this
  decision does not depend on Claude Code Web (or any other cloud environment) ever adding one; if
  one becomes available, it is a capability to document and use, not a gap this decision needs to
  reverse.
- **Say nothing, let each reader discover the limit by trying**: rejected — an undocumented limit
  reads as a bug until someone reports it and someone else explains it; naming it up front, with the
  reasoning, is the same effort as answering the question once.

**Identifier note.** The identifiers "R9.4" and "D16" were used for this exclusion in epic #213's
requirements triage and resolve to **no record under `.pair/`** — verified: neither string appears
anywhere in the committed adoption tree, only in this story's own ephemeral `.pair/working/`
scratch files. Per the same precedent as
[2026-07-28-marketplace-plugin-packaging.md](./2026-07-28-marketplace-plugin-packaging.md)'s
Decision 5 identifier note, this ADL is the record: code, tests, docs and the release-validation
suite cite **this ADL by link**, never the bare identifiers.

## Consequences

- No live-preview UI for cloud sessions is planned or promised anywhere in pair's docs, CLI, or
  skills. `qa/release-validation/CP10-web-cloud-environment.md` (MT-CP1004) records the absence of a
  live preview as its **expected result**, never as a failure — a release-validation run that
  observed a live preview appearing would itself be the surprising, reportable outcome.
- The headless-screenshot workaround must be **verified per environment**, not assumed: whether a
  headless browser installs and runs depends on the sandbox. `web-cloud-environments.mdx` documents
  the verified command sequence and its known failure modes (browser-download blocked by a network
  allowlist; a pre-installed browser at a revision the project's own `playwright-core` does not
  expect) rather than a single always-works command.
- Any future "can we get a preview URL" request is answered by this record — reopening it requires
  a superseding decision, not a one-off exception.

## Adoption Impact

None. This decision does not add or change an adopted tool, library, or convention (D21) — it
records a **capability boundary** of pair's own support for cloud coding environments, referenced
by the docs page and the release-validation critical path that describe that boundary. No
`adoption/tech/*` file requires a corresponding entry.
