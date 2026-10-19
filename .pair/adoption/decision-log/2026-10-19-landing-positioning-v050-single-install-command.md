# Decision: Landing Positioning for v0.5.0 and the Single Install Command

## Date

2026-10-19

## Status

Active

## Category

Convention Adoption

## Context

A clean-context review of the landing page (2026-10-19, report in the #562 run directory) found it still selling v0.3 pair ("context, guidelines and skills"), a four-step "How it works" that matched no documented phase, a primary CTA sending visitors to GitHub Releases while the docs lead with `pair-cli`, Works with missing pi and opencode, and three different first install commands across README (`npx @foomakers/pair-cli install`), Quickstart (`npm install -g @foomakers/pair-cli`) and the landing (a Releases download). Verdict: restructure, keep the shell (#562).

## Decision

- **Positioning, Option A**: keep the H1 "Code is the easy part." (brand equity, the only indexed phrase worth keeping); the sub-head states the lifecycle ("runs your development process with AI, from PRD to merged PR") and the three modes; "AI should not grade its own work" is the H2 of the delivery section, not the hero; the autonomy ladder is the Three modes section, always phrased "like the levels of driving automation", never a bare level badge.
- **One first install command everywhere**: `npm install -g @foomakers/pair-cli` then `pair-cli install`, as in Quickstart. The landing shows it inline, README leads with it, the Claude Code plugin (`/plugin install pair@pair`) is marked optional. GitHub Releases stays as the air-gapped fallback in the Open source section only.
- **Honest harness line**: any "works with" strip next to an autonomy claim carries the two-tier line (Assisted on every tool; Supervised and Autonomous need a harness with subagents or an engine: Claude Code, Codex, pi, opencode). pi and opencode ship as text chips until their logos clear the trademark check.
- **No unverifiable claims on the landing**: no throughput, defect or time-saved figure, no "community-driven", no "under a minute" (Quickstart says five minutes); the skill count is not shown (it drifts; the docs staleness check owns it). No em dashes in copy or metadata.
- **Every landing region keeps the a11y bar**: a `section` with an `aria-label` and a heading (`sr-only` where a visible one would be noise); diagrams are light-only and sit on a white card.

## Alternatives Considered

- **Option B, lead with "AI should not grade its own work"**: sharpest differentiator but drops the known tagline and narrows pair to delivery; used as the delivery section H2 instead.
- **Option C, "From copilot to autopilot"**: "copilot" collides with GitHub Copilot in search and "autopilot" over-promises for Assisted-only tools.
- **Keep `npx @foomakers/pair-cli install` as the first command**: one-shot and global install both work, but three different first commands cost more than either; Quickstart's global install is the documented default.
- **Add pi and opencode logos now**: blocked on trademark clearance; text chips carry the same information.

## Consequences

- Landing, README and Quickstart agree on the first command; a future change to the install path updates all three in one PR.
- Landing copy is tested (`landing.ct.test.tsx`): every region, CTA target, the no-em-dash rule and the poster; the a11y test runs on the whole page.
- The demo poster is a terminal frame of the existing video; a new video showing a Supervised run, dark diagram variants and the two logos wait until after v0.5.0.

## Adoption Impact

- `adoption/tech/ux-ui.md`: Brand Identity gains the landing conventions (tone, no em dash, one install command, a11y bar per region, light-only diagrams).
