---
'@pair/pair-cli': minor
---

Risk classification, quality gates and review:

- Quality model: three layers, three pillars (cost, security, delivery), classification rules and a tag taxonomy (#268). `/pair-capability-classify` builds the risk matrix in refinement and confirms or raises it in review, then projects `risk:*` tags (#348).
- Tier-aware pre-merge pipeline: it reads only the `risk:*` tag and treats an untagged item as 🔴 (#362). `verify-quality` runs locally the same check set CI runs for the tier (#378). `/review` names the PR to read the tier from (#420).
- Opt-in coverage baseline and guardrail (#368). The ratchet commits a raised baseline back as a bot PR (#405) and ships to adopters as `coverage-ratchet.cjs`, emitted by `setup-gates` (#463). Fix: `coverage-gate.sh` is executable (#424).
- New capabilities: `assess-security` with a deterministic gitleaks secret-scanning layer (#341). `assess-cost` classifies cost in review and has a report mode with billing telemetry (#361, #388, #532). `assess-coupling` checks the coupling-balance model (#381). `analyze-delivery-metrics` covers AI and retro metrics (#461).
- Verdict-first code-review template with security, cost and architecture sections, and the open-findings count shown at the top (#228, #376). A red-test-before-fix check for bug fixes (#283, #460).
- **Breaking:** the `TECH-DEBT` verdict is retired, and Minor findings block merge like Major. Severity is capped by how a finding is reached, so a contrived scenario is a Question (#225, #442).
- The review writes the PR's `risk:*`/`cost:*` labels from its own classification when it concludes. `publish-pr` no longer copies tags from the story (#441, #516).
- Bootstrap Phase 3.6 drafts the Criticality Table and Overrides (#422). New opt-in `business-impact.trivial-diff` override (#470).
- **Breaking:** `assess-*` skills are output-only, and `record-decision` is the only generic adoption writer (#310). Report skills are renamed to `analyze-*` (`analyze-debt`, `analyze-code-quality`) (#327).
- Shared lint/format config guideline, with `setup-gates` provisioning configs and husky hooks (#273). Design rules added to the code-design guidelines (#274).
