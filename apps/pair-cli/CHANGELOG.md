# @pair/pair-cli

## 0.5.0

### Minor Changes

- [`8166a02`](https://github.com/foomakers/pair/commit/8166a021f738a7b6dbae600b0199dadd3f009fb4) - Agent harnesses: pair runs on pi, opencode, Claude Code and Codex:
  - New `/pair-capability-setup-harness` makes any supported harness a valid pair environment. It resolves the harness, checks it against the project's needs and sets up skill paths, project context and model provider. It never touches credentials and only confirms on re-run. Bootstrap offers it at the end ([#450](https://github.com/foomakers/pair/issues/450)).
  - KB agent-harness guides for pi, opencode, Claude Code and Codex, one fixed 9-section index each, written from real installs ([#450](https://github.com/foomakers/pair/issues/450), [#441](https://github.com/foomakers/pair/issues/441)).
  - `tech/automation.md` gains `## Harness` (supported harnesses, optional `Requires: <access-path>`) and `## Model Policy` (model class per risk tier) ([#450](https://github.com/foomakers/pair/issues/450)).
  - `/pair-workflow-cycle` runs in-session on each harness. Claude Code uses subagents, Codex uses `spawn_agent` ([#441](https://github.com/foomakers/pair/issues/441)), and pi uses a pinned `pi-subagents` bridge (`pi ≥ 0.86.1`, `pi-subagents@0.71.0`). Setup-harness installs these only after an explicit yes. A pi stage resumes only inside its own session, otherwise it starts fresh and says so ([#503](https://github.com/foomakers/pair/issues/503)).
  - A harness with no subagent primitive HALTs with `realization-unavailable` and points to `pair-cli run` ([#486](https://github.com/foomakers/pair/issues/486)).
  - Pair is verified and documented on Claude Code Web ([#225](https://github.com/foomakers/pair/issues/225)).

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - `/pair-assistant` is now also pair's configuration guide ([#552](https://github.com/foomakers/pair/issues/552)):
  - Capability menu, `kb-cache` and `tokens` rows, and a Configure step that routes each configuration area (autonomy, cycle hooks, blocking severities, workflow profiles, `skipRegistries`, adoption files) to its owner, shows the diff, validates with the installed cycle scripts and writes through record-decision.
  - Docs: new pages `reference/pair-assistant`, `reference/adoption-settings`, `concepts/delivery-workflow`, `developer-journey/lifecycle-modes`; optional marketplace quickstart; "With the CLI / With `/pair-assistant`" pairs; five new diagrams; `docs:staleness` now checks the "Via" line per command and every internal `#anchor`.

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Supervised automation, autonomy and the PR state flow:
  - `/pair-loop` advances the backlog unattended inside a project policy (`tech/automation.md`: `## Eligibility`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location`), and every setting fails closed. Auto-development eligibility is an adoption tag set by classification ([#250](https://github.com/foomakers/pair/issues/250), [#216](https://github.com/foomakers/pair/issues/216), [#443](https://github.com/foomakers/pair/issues/443), [#458](https://github.com/foomakers/pair/issues/458)).
  - Autonomy model, with one syntax for adoption (`## Autonomy`), `pair-cli run` flags and skill arguments. Selection: `filter` (labels, any-of), `assignee`, `status`, optional `root`. Target: `until: ready | pr | merged`. Two gates, `prepare` and `merge`, written `always | never | when; has: <labels>; lacks: <labels>`. Escalation is checked at every stage boundary and parks the card as `escalated`. Precedence is argument > adoption > KB default, and every effective value is printed with its source. Defaults are unchanged: nothing is prepared or merged without a declared gate. Legacy `## Auto-Advance`/`## Eligibility` still work and are translated ([#521](https://github.com/foomakers/pair/issues/521), [#525](https://github.com/foomakers/pair/issues/525)).
  - Autonomous prepare: refinement and task breakdown run as one phase under the prepare gate. `until: ready` stops after it. An open question escalates the card with `needs-review` and leaves it in Draft ([#523](https://github.com/foomakers/pair/issues/523), [#529](https://github.com/foomakers/pair/issues/529)).
  - Batch = cycle on N cards. `pair-implement-batch` follows the same rules and arguments as `/pair-workflow-cycle` and merges a card only when the merge gate allows it. Without the Workflow tool it falls back to the cycle, one card at a time. `pair-loop` only selects and has no merge of its own. The cycle, the batch (sequential or parallel) and `pair-cli run` are parity-tested ([#524](https://github.com/foomakers/pair/issues/524), [#527](https://github.com/foomakers/pair/issues/527)).
  - The batch engine `pair-implement-batch` and its sibling `pair-refine-batch` (classify, refine or triage) ship as product artifacts with a configurable pipeline, bounded fan-out and a frozen contract ([#219](https://github.com/foomakers/pair/issues/219), [#432](https://github.com/foomakers/pair/issues/432)). Fix: a batch launched with invalid args now fails loudly instead of reporting an empty success ([#401](https://github.com/foomakers/pair/issues/401)).
  - PR state flow separates mechanical gates from judgment review. `pair-review` and `pair-explicit-approval` are required checks, so a PR merges only when gates are green, the review approves and, at 🔴, a human approves ([#234](https://github.com/foomakers/pair/issues/234), [#390](https://github.com/foomakers/pair/issues/390)).
  - Solo-maintainer `/approve <head-sha>` token for 🔴 PRs. Auto-merge re-verifies its signals first. Below 🔴 the explicit-approval check passes on its own, and the merge gate reads the PR's risk tier ([#398](https://github.com/foomakers/pair/issues/398), [#472](https://github.com/foomakers/pair/issues/472), [#495](https://github.com/foomakers/pair/issues/495), [#530](https://github.com/foomakers/pair/issues/530)).
  - Dedicated review identity (GitHub App or bot) plus optional auto-approval for light PRs, gated by adoption ([#218](https://github.com/foomakers/pair/issues/218), [#466](https://github.com/foomakers/pair/issues/466)).
  - `$approval: interactive | auto` lets `assess-*`/`map-*` run non-interactively when composed by a loop ([#410](https://github.com/foomakers/pair/issues/410), [#462](https://github.com/foomakers/pair/issues/462)).
  - `/implement` ticks the inline task checklist and posts one batched progress comment per run ([#220](https://github.com/foomakers/pair/issues/220), [#468](https://github.com/foomakers/pair/issues/468)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Risk classification, quality gates and review:
  - Quality model: three layers, three pillars (cost, security, delivery), classification rules and a tag taxonomy ([#268](https://github.com/foomakers/pair/issues/268)). `/pair-capability-classify` builds the risk matrix in refinement and confirms or raises it in review, then projects `risk:*` tags ([#348](https://github.com/foomakers/pair/issues/348)).
  - Tier-aware pre-merge pipeline: it reads only the `risk:*` tag and treats an untagged item as 🔴 ([#362](https://github.com/foomakers/pair/issues/362)). `verify-quality` runs locally the same check set CI runs for the tier ([#378](https://github.com/foomakers/pair/issues/378)). `/review` names the PR to read the tier from ([#420](https://github.com/foomakers/pair/issues/420)).
  - Opt-in coverage baseline and guardrail ([#368](https://github.com/foomakers/pair/issues/368)). The ratchet commits a raised baseline back as a bot PR ([#405](https://github.com/foomakers/pair/issues/405)) and ships to adopters as `coverage-ratchet.cjs`, emitted by `setup-gates` ([#463](https://github.com/foomakers/pair/issues/463)). Fix: `coverage-gate.sh` is executable ([#424](https://github.com/foomakers/pair/issues/424)).
  - New capabilities: `assess-security` with a deterministic gitleaks secret-scanning layer ([#341](https://github.com/foomakers/pair/issues/341)). `assess-cost` classifies cost in review and has a report mode with billing telemetry ([#361](https://github.com/foomakers/pair/issues/361), [#388](https://github.com/foomakers/pair/issues/388), [#532](https://github.com/foomakers/pair/issues/532)). `assess-coupling` checks the coupling-balance model ([#381](https://github.com/foomakers/pair/issues/381)). `analyze-delivery-metrics` covers AI and retro metrics ([#461](https://github.com/foomakers/pair/issues/461)).
  - Verdict-first code-review template with security, cost and architecture sections, and the open-findings count shown at the top ([#228](https://github.com/foomakers/pair/issues/228), [#376](https://github.com/foomakers/pair/issues/376)). A red-test-before-fix check for bug fixes ([#283](https://github.com/foomakers/pair/issues/283), [#460](https://github.com/foomakers/pair/issues/460)).
  - **Breaking:** the `TECH-DEBT` verdict is retired, and Minor findings block merge like Major. Severity is capped by how a finding is reached, so a contrived scenario is a Question ([#225](https://github.com/foomakers/pair/issues/225), [#442](https://github.com/foomakers/pair/issues/442)).
  - The review writes the PR's `risk:*`/`cost:*` labels from its own classification when it concludes. `publish-pr` no longer copies tags from the story ([#441](https://github.com/foomakers/pair/issues/441), [#516](https://github.com/foomakers/pair/issues/516)).
  - Bootstrap Phase 3.6 drafts the Criticality Table and Overrides ([#422](https://github.com/foomakers/pair/issues/422)). New opt-in `business-impact.trivial-diff` override ([#470](https://github.com/foomakers/pair/issues/470)).
  - **Breaking:** `assess-*` skills are output-only, and `record-decision` is the only generic adoption writer ([#310](https://github.com/foomakers/pair/issues/310)). Report skills are renamed to `analyze-*` (`analyze-debt`, `analyze-code-quality`) ([#327](https://github.com/foomakers/pair/issues/327)).
  - Shared lint/format config guideline, with `setup-gates` provisioning configs and husky hooks ([#273](https://github.com/foomakers/pair/issues/273)). Design rules added to the code-design guidelines ([#274](https://github.com/foomakers/pair/issues/274)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - New `pair-cli` commands and naming:
  - `pair-cli scaffold-kb`: scaffolds an external KB repository with a release script, built on `pair-cli package` ([#391](https://github.com/foomakers/pair/issues/391)).
  - `pair-cli tokens [--baseline]`: measures the token footprint of the installed context and reports the delta against a committed baseline ([#539](https://github.com/foomakers/pair/issues/539)).
  - Every doc, help text and shipped script now names the published binary `pair-cli`. The release smoke scripts fail hard when they cannot find it, instead of skipping ([#473](https://github.com/foomakers/pair/issues/473)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Delivery cycle: one state machine, many realizations:
  - One cycle (prepare → validate → implement → green → verify → merge) with its rules in one owner (`cycle-state.mjs`), and three realizations: in-session `/pair-workflow-cycle`, console `pair-cli run --card`, parallel `pair-implement-batch` on Claude Code. Stages talk through handoffs on disk, never the transcript, and every run resumes from its first incomplete step ([#479](https://github.com/foomakers/pair/issues/479), [#480](https://github.com/foomakers/pair/issues/480), [#486](https://github.com/foomakers/pair/issues/486), [#487](https://github.com/foomakers/pair/issues/487)).
  - New `/pair-workflow-cycle` drives one card one stage per subagent from Claude Code, Codex or pi. It can also enter on an existing PR for fix and review only (`$pr`, `$rounds`) ([#486](https://github.com/foomakers/pair/issues/486), [#494](https://github.com/foomakers/pair/issues/494)).
  - The delivery workflow is rebuilt as a coordinator plus phase skills (`red-spec`, `red-verify`, `green-fix`, `implement-phase`, `review-phase`), with deterministic seal and custody scripts. Five typed subagents ship and install to `.claude/agents/` (`pair-implementer`, `pair-reviewer`, `pair-fix-test-author`, `pair-red-contract-verifier`, `pair-contract-generator`) ([#479](https://github.com/foomakers/pair/issues/479), [#480](https://github.com/foomakers/pair/issues/480), [#432](https://github.com/foomakers/pair/issues/432)).
  - **Breaking (cycle contract):** a fresh card starts at test-first implement with no up-front contract, and its self-review is never recorded. Every open review finding must carry a reproducer or a failure scenario. Findings still go through the sealed prepare → validate → green path. `red-snapshot.mjs seal` requires `--static-gates` ([#506](https://github.com/foomakers/pair/issues/506), [#509](https://github.com/foomakers/pair/issues/509)).
  - `merge` is a cycle stage. It re-reads tier, remote head, `pair-review` and `pair-explicit-approval` live and requires the reviewed head. Only then does it squash-merge, tick the DoD, close the card with its parent cascade, move the board to Done and delete the branch. Any red leaves a comment on the card naming the condition ([#490](https://github.com/foomakers/pair/issues/490), [#520](https://github.com/foomakers/pair/issues/520)).
  - PM and code-host adapters, GitHub and Azure DevOps. Card operations follow `pm-tool` and PR operations follow `code-host`. The cycle scripts no longer call `gh` directly. A declared host with no adapter HALTs with `host-unsupported`, with no silent GitHub fallback. A KB extension guide shows how to add an adapter (8 methods, worked stub) ([#492](https://github.com/foomakers/pair/issues/492), [#513](https://github.com/foomakers/pair/issues/513)).
  - Cycle Hooks in `## Cycle Hooks`: `pre-/post-<stage>`, `pre-/post-cycle` and `on-halt`. A failing `pre-*` HALTs (`failed-hook`), `post-*` only logs, and stage hooks run in the story worktree. One executor serves both coordinators ([#489](https://github.com/foomakers/pair/issues/489), [#519](https://github.com/foomakers/pair/issues/519)).
  - Workflow profiles: named JSON profiles set engine, model (id, `cheap|balanced|frontier` or `by-tier`), effort and context per stage, via `pair.config.json` `workflowProfiles`, `--profile` or `--workflow-config`. They fail closed on typos and unknown stages ([#488](https://github.com/foomakers/pair/issues/488), [#517](https://github.com/foomakers/pair/issues/517)).
  - Adoption decides what blocks: `## Blocking Severities` (default `Critical, Major, Minor`). The hard-coded 40-dispatch cap is gone, replaced by an optional `max-dispatches: <n> [warn|block]`. `supersede` recovers any stage's last handoff ([#514](https://github.com/foomakers/pair/issues/514), [#515](https://github.com/foomakers/pair/issues/515)).
  - The four cycle agents default to `sonnet` ([#498](https://github.com/foomakers/pair/issues/498)). A custody check can be waived only by an explicit, attributed override ([#497](https://github.com/foomakers/pair/issues/497)). Machine contracts are derived from KB templates and cached by hash ([#292](https://github.com/foomakers/pair/issues/292), [#318](https://github.com/foomakers/pair/issues/318)).
  - KB `collaboration/automation/delivery-cycle.md`: one reference for the cycle, stages, realizations, profiles, hooks, merge and adapters, with diagrams ([#493](https://github.com/foomakers/pair/issues/493), [#530](https://github.com/foomakers/pair/issues/530)).
  - Fixes: every remediation group gets its own findings. red-spec refuses unformatted test artifacts. red-verify lists every gap in one rejection. implement-phase moves the card to `In Progress` and lists external AC as pending live verification. An external-only block can always be answered with `decide`. A bare `eslint` inside a package finds the shared config ([#542](https://github.com/foomakers/pair/issues/542)).
  - Fixes: every stage resolves with `--acHash`. A decided external blocker gets re-reviewed. The worktree checks out an existing card branch. Post-merge closure resolves the repo slug and deletes the branch through the host API. Review noise is reduced across escalations and resumes ([#373](https://github.com/foomakers/pair/issues/373), [#374](https://github.com/foomakers/pair/issues/374)).

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Install into a repo that already has its own agent files ([#552](https://github.com/foomakers/pair/issues/552)):
  - `pair-cli install --skip-registries <names>` leaves registries out (e.g. `agents` keeps your `AGENTS.md`/`CLAUDE.md`); an unknown name exits 1 and lists valid ones.
  - Install now refuses an existing `CLAUDE.md` copy target too (before, a lone `CLAUDE.md` was overwritten silently). Use `--skip-registries agents` to keep it.
  - `/pair-assistant` asks keep/overwrite per file; overwrite backs up with `mv X X.bak`.

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - KB install, update and verification:
  - **Breaking:** `pair-cli update` now deletes installed files the Knowledge Base no longer ships, so the target matches what the transform produces ([#421](https://github.com/foomakers/pair/issues/421)). See the v0.4→v0.5 migration page.
  - **Breaking:** exit codes are reliable. `kb-verify`, `kb-info` and `kb-cache` exit non-zero on failure. `install`/`update` exit 1 on a per-registry copy failure or a no-op ([#447](https://github.com/foomakers/pair/issues/447)).
  - `install --source`/`update --source` honour the source KB's own `pair.config.json` registry declaration, on a guarded allowlist ([#447](https://github.com/foomakers/pair/issues/447)).
  - Writes are atomic: each registry target is staged and swapped in by rename, so concurrent installs/updates never leave a half-written tree ([#534](https://github.com/foomakers/pair/issues/534)).
  - Cache slots are keyed by source identity, so installing an external KB no longer corrupts the official KB cache for other projects ([#423](https://github.com/foomakers/pair/issues/423)).
  - `kb-info` reports installed vs current KB version, including git sources, and points to the migration page on drift ([#309](https://github.com/foomakers/pair/issues/309), [#444](https://github.com/foomakers/pair/issues/444)).
  - `kb-validate` accepts optional link patterns (`link_validation.optional_link_patterns`, `--optional-link-patterns`): a missing target that matches is a warning, not an error ([#445](https://github.com/foomakers/pair/issues/445)).
  - Two new registries install the Claude Code workflows (`.claude/workflows/`: `pair-implement-batch`, `pair-refine-batch`, `pair-loop`) and the delivery subagents (`.claude/agents/`), all `pair-` prefixed ([#219](https://github.com/foomakers/pair/issues/219), [#432](https://github.com/foomakers/pair/issues/432)).
  - Skills install flattened and prefixed, with `/command` references rewritten across runs. A skill's nested `references/` stays inside the skill ([#269](https://github.com/foomakers/pair/issues/269), [#411](https://github.com/foomakers/pair/issues/411)).
  - `.pair/working` (or the `working_path` override) is never a registry target, and a config that overlaps a reserved path is rejected ([#308](https://github.com/foomakers/pair/issues/308)).
  - `pair-cli package` quick mode uses the same defaults cascade as guided mode ([#349](https://github.com/foomakers/pair/issues/349)).
  - Fixes: `@pair/content-ops` ships as a runtime dependency, so KB commands no longer crash on a fresh npm install ([#358](https://github.com/foomakers/pair/issues/358)). `update` is self-consistent on the dogfooded root install ([#346](https://github.com/foomakers/pair/issues/346)). The download HEAD probe uses the injected HTTP client ([#518](https://github.com/foomakers/pair/issues/518)).

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Keep choice survives `update` ([#552](https://github.com/foomakers/pair/issues/552)):
  - `install --skip-registries agents` now writes `"skipRegistries": ["agents"]` into the project's `pair.config.json`; `update` honours it (`skipping agents (from pair.config.json)`), so your own `AGENTS.md`/`CLAUDE.md` are no longer overwritten.
  - `update --skip-registries <names>` (same parser as install; names persisted). Unknown flag name exits 1; unknown name in config warns and is ignored.
  - Remove the name from `skipRegistries` to opt back in; the next `update` installs pair's files (backup only with `--persist-backup`).
  - An unparseable or non-object project `pair.config.json`, or a non-string-array `skipRegistries`, now makes install/update exit 1 naming the file (before: warn and continue).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - `pair-cli run`: run pair's delivery from the console on any engine:
  - `pair-cli run` executes a skill headless inside `pi`, `opencode` or `claude -p`, re-invoking it until the stop condition is met. The engine comes from `--engine`, then `pair.config.json`, then the default, and the resolved command is printed before anything runs ([#451](https://github.com/foomakers/pair/issues/451), [#459](https://github.com/foomakers/pair/issues/459)).
  - `--card <id>` coordinates one card through the whole delivery cycle stage by stage, with a fresh engine process per stage. It resumes from the step that is due. A card that is not ready falls back to preparation. `--pr <n>` enters at fix and review, and `--rounds` and `--run-id` are also available ([#487](https://github.com/foomakers/pair/issues/487), [#504](https://github.com/foomakers/pair/issues/504)).
  - `--root <id> --parallel <n>` fans out over a subtree as separate `run --card` processes. The limit is min(dependencies, `## Max Parallelism`, the flag), printed with every excluded card and the reason. Mutex resources are locked and released on Ctrl-C ([#491](https://github.com/foomakers/pair/issues/491), [#511](https://github.com/foomakers/pair/issues/511)).
  - Portable loop: `--watch`/`--interval` (default 10m, floor 60s) runs a fresh selection every iteration. `--filter`, `--assignee`, `--status` and `--max-iterations` work with `--parallel`, and `--root` is optional when `--filter` is set. Escalated and locked cards are skipped. The loop stops at the Stop Predicate, the iteration cap or Ctrl-C (exit 130/143), printing one line per iteration and writing an audit trail ([#522](https://github.com/foomakers/pair/issues/522), [#526](https://github.com/foomakers/pair/issues/526)).
  - Autonomy flags `--until`, `--prepare` and `--merge` set how far a card goes and which gates allow refinement or merge. The policy is printed once with its sources before any card is touched. Exit codes tell `escalated` (1) apart from `target-ready` (0) ([#521](https://github.com/foomakers/pair/issues/521), [#523](https://github.com/foomakers/pair/issues/523), [#525](https://github.com/foomakers/pair/issues/525), [#529](https://github.com/foomakers/pair/issues/529)).
  - `--profile`/`--workflow-config` pick the engine, model, effort and context per stage ([#488](https://github.com/foomakers/pair/issues/488), [#517](https://github.com/foomakers/pair/issues/517)). Cycle Hooks run around each stage ([#489](https://github.com/foomakers/pair/issues/489), [#519](https://github.com/foomakers/pair/issues/519)).
  - `--card --card-tags` routes tagged cards to the workflow named in `## Workflows`. Untagged cards are left alone ([#217](https://github.com/foomakers/pair/issues/217), [#474](https://github.com/foomakers/pair/issues/474)).
  - `--autonomous` also passes `$approval=auto` to composed skills that declare an approval round ([#464](https://github.com/foomakers/pair/issues/464), [#465](https://github.com/foomakers/pair/issues/465)).
  - `--engine pi` without pi installed points to `/pair-capability-setup-harness` ([#503](https://github.com/foomakers/pair/issues/503), [#512](https://github.com/foomakers/pair/issues/512)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Process, planning and domain-model skills:
  - **Breaking:** canonical macrostates (Draft → Ready → In Progress → Review → Done) with an n-m `## State Mapping` in way-of-working. `write-issue` takes `$status: Ready` instead of `Refined` ([#265](https://github.com/foomakers/pair/issues/265), [#337](https://github.com/foomakers/pair/issues/337)). Canonical DoR/DoD, plus a Control-State resolution in `/pair-next` that falls back to the DoR ([#340](https://github.com/foomakers/pair/issues/340), [#535](https://github.com/foomakers/pair/issues/535)).
  - `refine-story` is the single Draft → Ready path. It starts with a `grill(sync)` alignment gate and writes the classification into the story template ([#360](https://github.com/foomakers/pair/issues/360)). New `/pair-capability-grill` ([#267](https://github.com/foomakers/pair/issues/267)) and `/pair-process-brainstorm` ([#387](https://github.com/foomakers/pair/issues/387)). Plan skills triage extend-vs-create before writing ([#338](https://github.com/foomakers/pair/issues/338)). Generation reads the project's adoption before drafting ([#446](https://github.com/foomakers/pair/issues/446)).
  - Domain model: `context-map.md` template with inline maintenance ([#271](https://github.com/foomakers/pair/issues/271)), DDR ([#293](https://github.com/foomakers/pair/issues/293)) and analysis-log ([#339](https://github.com/foomakers/pair/issues/339)) record types.
  - **Breaking:** `map-subdomains`/`map-contexts` are now capabilities (`/pair-capability-map-*`) and `$scope` is required. How-to guides 04/05 are removed ([#272](https://github.com/foomakers/pair/issues/272)).
  - `/pair-next`: `--root`/`--filter` for scoped selection ([#249](https://github.com/foomakers/pair/issues/249), [#350](https://github.com/foomakers/pair/issues/350)), with any-of `--filter` plus `--assignee`/`--status` from the autonomy model ([#525](https://github.com/foomakers/pair/issues/525)), and `--mode analysis|implementation|review` to run a whole macro-phase ([#252](https://github.com/foomakers/pair/issues/252), [#536](https://github.com/foomakers/pair/issues/536)).
  - Publish-PR Hooks (`pre-publish` blocks, `post-publish` only logs) are read from `tech/automation.md`. A `mirror-realign` asset ships for repos with generated mirrors ([#419](https://github.com/foomakers/pair/issues/419), [#476](https://github.com/foomakers/pair/issues/476)).
  - `## Process Profile` (`default`/`poc`/`custom`) turns off process steps a project does not run ([#467](https://github.com/foomakers/pair/issues/467)). Package-local adoption overrides live in `<pkg>/.pair/` ([#537](https://github.com/foomakers/pair/issues/537)). Bootstrap gains a quick mode ([#408](https://github.com/foomakers/pair/issues/408)).
  - `/implement` closes by writing a checkpoint and handing off to `/pair-capability-publish-pr` in a clean subagent ([#270](https://github.com/foomakers/pair/issues/270), [#347](https://github.com/foomakers/pair/issues/347), [#359](https://github.com/foomakers/pair/issues/359)).
  - PM tools: Azure DevOps is supported end to end, including `setup-pm` ([#317](https://github.com/foomakers/pair/issues/317), [#481](https://github.com/foomakers/pair/issues/481)). The code host can differ from the PM tool ([#389](https://github.com/foomakers/pair/issues/389)). `write-issue`/`publish-pr` confirm board membership and resolve the assignee before writing state ([#404](https://github.com/foomakers/pair/issues/404), [#425](https://github.com/foomakers/pair/issues/425)).
  - Template overrides in `.pair/adoption/tech/templates/` are honoured by every skill ([#367](https://github.com/foomakers/pair/issues/367)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Release pipeline:
  - Every PR carries a changeset. `pnpm release <pre|rc|final> [--version X.Y.Z] [--dry-run]` plans a release on the pre, rc or final channel, and `version.yml`/`release.yml` run only on dispatch. Obsolete prereleases are cleaned up after a successful publish ([#541](https://github.com/foomakers/pair/issues/541)).
  - Internal: gate scripts moved into tested modules (`@pair/dev-tools`, `@pair/release-tools`). `format:check` covers the whole repo in CI and the pre-push hook. Gates for `llms.txt` drift, mirror equality and skill-local scripts. Smoke tests run pre-merge, including cross-platform and remote-source scenarios. Audit tech-debt cleared ([#330](https://github.com/foomakers/pair/issues/330), [#333](https://github.com/foomakers/pair/issues/333), [#334](https://github.com/foomakers/pair/issues/334), [#311](https://github.com/foomakers/pair/issues/311), [#412](https://github.com/foomakers/pair/issues/412), [#454](https://github.com/foomakers/pair/issues/454), [#477](https://github.com/foomakers/pair/issues/477), [#475](https://github.com/foomakers/pair/issues/475), [#377](https://github.com/foomakers/pair/issues/377), [#406](https://github.com/foomakers/pair/issues/406), [#531](https://github.com/foomakers/pair/issues/531), [#424](https://github.com/foomakers/pair/issues/424), [#500](https://github.com/foomakers/pair/issues/500), [#505](https://github.com/foomakers/pair/issues/505)).

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Skill corpus and distribution:
  - Native Claude Code channel: `/plugin marketplace add foomakers/pair`, then `/plugin install pair@pair`. The plugin ships one bootstrap skill, `/pair-assistant`, which installs `pair-cli`, runs it and then helps drive it. The full catalog still arrives through the CLI ([#277](https://github.com/foomakers/pair/issues/277), [#386](https://github.com/foomakers/pair/issues/386)).
  - Skill corpus overhaul: trigger-oriented descriptions, shared conventions extracted to KB references, progressive disclosure for implement/review/bootstrap, sharper completion criteria, router/catalog fixes, and an effectiveness standard with a trigger eval and conformance gate ([#319](https://github.com/foomakers/pair/issues/319), [#324](https://github.com/foomakers/pair/issues/324), [#325](https://github.com/foomakers/pair/issues/325), [#328](https://github.com/foomakers/pair/issues/328), [#329](https://github.com/foomakers/pair/issues/329), [#331](https://github.com/foomakers/pair/issues/331), [#332](https://github.com/foomakers/pair/issues/332), [#335](https://github.com/foomakers/pair/issues/335)).
  - Skill conventions moved to `guidelines/technical-standards/ai-development/skill-conventions/` ([#370](https://github.com/foomakers/pair/issues/370)).
  - Less context per session: slimmer skills and templates, template word limits, a shrink-discipline guideline, and `rtk` limited to review ([#316](https://github.com/foomakers/pair/issues/316), [#323](https://github.com/foomakers/pair/issues/323), [#539](https://github.com/foomakers/pair/issues/539)).
  - Fix: dataset `AGENTS.md` points at current adoption/KB paths ([#264](https://github.com/foomakers/pair/issues/264)).

### Patch Changes

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Fixes from v0.5.0-pre.2 validation ([#552](https://github.com/foomakers/pair/issues/552)):
  - `update --persist-backup` and auto-rollback now cover copy targets such as `CLAUDE.md`, not only `AGENTS.md`.
  - KB 404 message keeps the prerelease (`KB v0.5.0-pre.1 not found (404)`).
  - Release CLI prunes tags deleted on origin before planning.

- [#545](https://github.com/foomakers/pair/pull/545) [`1470fd5`](https://github.com/foomakers/pair/commit/1470fd5eadf4bdecc1f51e9d7413b447ae924764) Thanks [@rucka](https://github.com/rucka)! - Delivery cycle: three gaps found driving [#543](https://github.com/foomakers/pair/issues/543) closed:
  - The cycle now moves the card to `In Progress`. `cycle-state.mjs activate-card` writes the board state mapped to `In Progress` in `## State Mapping` through the bound PM adapter and reads it back. Implement-phase calls it first.
  - `cycle-state.mjs publish` refuses a red-spec contract that the validator would reject one round later: a witness/control command it refuses as unsafe (for example a leading `bash`), `command-unsafe:<row>`, and a witness/control row with no runnable command, `row-not-runnable:<row>`. The red-spec skill now states the command shape.
  - Implement-phase and review-phase run the adopted `worktree-setup-command` (new `way-of-working.md` key) in a fresh worktree before any gate, and never symlink another checkout's `node_modules`/`dist`.

- [#544](https://github.com/foomakers/pair/pull/544) [`f965e52`](https://github.com/foomakers/pair/commit/f965e525e1e44dd898279c988cf4ba710ad689d5) Thanks [@rucka](https://github.com/rucka)! - Release validation suite aligned with v0.5.0: channel-aware CPs (`$CHANNEL` pre/rc/final), refreshed CLI/KB assertions, new CP11 (release pipeline) and CP12 (plugin marketplace), new smoke scenarios (`update-removes-files`, `inspect-commands`, run flags); release artifact smokes now test the artifact past install (`run-all.sh --binary` no longer replaced by the packaging preflight) ([#543](https://github.com/foomakers/pair/issues/543)). Increment 2: CP1/CP6 cases follow the v0.5.0 landing and docs IA (MT-CP102/105/106, new MT-CP114, MT-CP606, new MT-CP612).

- [#551](https://github.com/foomakers/pair/pull/551) [`9249ccf`](https://github.com/foomakers/pair/commit/9249ccf8290df2ecc3aca1ce017ab3feb2b4fa28) Thanks [@rucka](https://github.com/rucka)! - Smoke + release-validation coverage for the [#549](https://github.com/foomakers/pair/issues/549) fixes: scenarios for the adoption-free install, the package round-trip, `update --persist-backup`, `update-link --dry-run` and the `kb-info` corrupt-ZIP message; CP edits match shipped CLI behaviour ([#550](https://github.com/foomakers/pair/issues/550)).

- [#564](https://github.com/foomakers/pair/pull/564) [`ed2aade`](https://github.com/foomakers/pair/commit/ed2aade28d1db936ba43f44035b318962437e6d2) Thanks [@rucka](https://github.com/rucka)! - Docs and parser JSDoc: `--profile` / `--workflow-config` work with `--card`, `--root` or `--parallel`; removed the stale `--card`-only caveat ([#560](https://github.com/foomakers/pair/issues/560)).

- [`43d2f28`](https://github.com/foomakers/pair/commit/43d2f28c499d8ccc7c82980076a0abe681246aab) Thanks [@rucka](https://github.com/rucka)! - `pair-cli run`: a profile stage's `effort` now reaches `claude` (`--effort`) and `codex` (`-c model_reasoning_effort`, `xhigh`/`max` mapped to `high`); engines without a verified flag warn once and the table marks the stage `ignored`. `--profile` / `--workflow-config` now work with `--root` / `--parallel` / `--watch` and are forwarded to every child card; an unknown profile halts `profile-unresolved` before any child spawns.

- [#549](https://github.com/foomakers/pair/pull/549) [`fcbe1be`](https://github.com/foomakers/pair/commit/fcbe1be4976bea3232951c6ed7a13af15a2d46cc) Thanks [@rucka](https://github.com/rucka)! - v0.5.0 blockers from pre.1 validation ([#548](https://github.com/foomakers/pair/issues/548)):
  - A fresh install no longer ships pair's own `tech/automation.md` or decision logs, and no `mirrors:regenerate` hook (a conformance test guards the dataset adoption).
  - `package` without `--layout` validates and packs the same layout (default `target`), packages the canonical copy only, and unflattens skills to `<category>/<name>` with links rewritten, so `kb-verify`, `kb-validate --layout source` and `install --source` round-trip. `kb-verify` finds file registries (`AGENTS.md`).
  - `package --help` and docs show `--pkg-version`, never `--version`.
  - `update --persist-backup` keeps `.pair/backups/`.
  - `update-link --dry-run` prints what would change (or "No changes") and modifies nothing.
  - `kb-info <corrupt.zip>` exits 1 with `Invalid ZIP archive: <path>`.
  - A custom KB URL download message names no CLI version.

- [`41362af`](https://github.com/foomakers/pair/commit/41362af878662ff59a7d5f9f3481070878085c86) - Documentation website:
  - Information architecture rebuilt: a hub page, `guides/` dissolved, duplicates removed, and the staleness gate extended ([#315](https://github.com/foomakers/pair/issues/315), [#275](https://github.com/foomakers/pair/issues/275)).
  - Migrations section with the v0.4→v0.5 page, checked by dogfooding it on pair ([#266](https://github.com/foomakers/pair/issues/266), [#337](https://github.com/foomakers/pair/issues/337), [#354](https://github.com/foomakers/pair/issues/354), [#538](https://github.com/foomakers/pair/issues/538)).
  - New pages: delivery-cycle reference with diagrams ([#530](https://github.com/foomakers/pair/issues/530)), risk-driven delivery operations ([#533](https://github.com/foomakers/pair/issues/533)), quality-gates configuration reference ([#375](https://github.com/foomakers/pair/issues/375)), unattended-delivery tutorial, Claude Code Web guide ([#442](https://github.com/foomakers/pair/issues/442)), Codex harness guide ([#516](https://github.com/foomakers/pair/issues/516)). PM-tools pages rewritten problem-first ([#478](https://github.com/foomakers/pair/issues/478)).

- Updated dependencies []:
  - @pair/content-ops@0.5.0
  - @pair/knowledge-hub@0.5.0

## 0.4.3

### Minor Changes

- 89e03be: feat: publish @foomakers/pair-cli to npmjs.org (#181)
  fix: wire --config through dispatch path for update and install (#186)
  fix: depth-aware link rewriting in target-layout packaging (#187)
  fix: bypass cache when --source/customUrl is provided (#189)
  fix: normalize include paths in buildCopyOptions to match resolveBehavior keys

### Patch Changes

- @pair/knowledge-hub@0.4.3

## 0.4.2

### Patch Changes

- a698478: Fix package validation to respect `--layout` target resolution.
  - @pair/knowledge-hub@0.4.2

## 0.4.1

### Patch Changes

- c53b8cf: Release v0.4.1 — Website, Docs & Brand Identity

  ### Website
  - **Landing page** with brand identity, demo video, and accessible design
  - **Full-text search** powered by Orama (client-side, zero external deps)
  - **Vercel hosting** with automatic preview deploys on PRs

  ### Documentation
  - **Getting Started** guides for solo devs, teams, and organizations
  - **4 tutorials**: first project, existing project, team setup, enterprise adoption
  - **6 how-to guides**: CLI workflows, install from URL, customize KB, adopter checklist, troubleshooting, update links
  - **Reference**: CLI commands, 31 skills catalog, KB structure, configuration
  - **Customization**: how to adopt pair, customize templates, scale to teams and orgs
  - **Developer Journey**: step-by-step from induction to execution
  - **Integrations**: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf
  - **PM Tools**: Filesystem, GitHub Projects, Linear
  - **Contributing**: dev setup, architecture, skills authoring, KB guidelines, release process
  - **FAQ**: 22 answers across 6 categories

  ### CLI
  - **llms.txt support**: auto-generates `.pair/llms.txt` on install/update; website serves `/llms.txt` and `/llms-full.txt` for LLM-friendly discovery
  - **New branding**: pair logo and tagline shown on every CLI command

  ### Fixes
  - Search now works correctly on all docs pages
  - Navigation no longer loops on section index pages

- Updated dependencies [c53b8cf]
  - @pair/knowledge-hub@0.4.1

## 0.4.0

### Minor Changes

- f9a4878: Add organizational KB packaging (--org flag) and kb-info command

### Patch Changes

- @pair/knowledge-hub@0.4.0

## 0.3.0

### Minor Changes

- ba651dd: Prepare release `0.3.0`.

  Highlights:
  - Install KB from URL, local ZIP, or local directory with resume support,
    progress reporting, and SHA256 validation.
  - Add `pair package` command to create validated KB ZIP packages with manifest
    and checksum generation for distribution.
  - Introduce `pair update-link` command to validate and convert KB links
    (relative/absolute) and provide CI-friendly dry-run and verbose modes.
  - Replace boolean `--verbose` flags with explicit `--log-level <level>` across the CLI. Migration: use `--log-level debug` where you previously used `--verbose`. (Note: backward-compat alias not added in this release.)
  - Separate KB dataset release workflow and auto-download/cache manager
    for runtime KB consumption.
  - Multiple UX and reliability improvements: retry logic, TTY detection,
    streaming downloads, and improved error messages.
  - Minor fixes.

  This release is backward compatible and focuses on KB distribution and
  packaging features for adopters and teams managing private KBs.

### Patch Changes

- Updated dependencies [ba651dd]
  - @pair/knowledge-hub@0.3.0

## 0.2.0

### Minor Changes

- # Release v0.2.0 - Enhanced CLI Distribution & Documentation

  ## 🚀 New Features

  ### GitHub Packages Publishing Support (#20)
  - **CLI Distribution**: Added automated publishing to GitHub Packages registry
  - **Release Automation**: Complete CI/CD pipeline for packaging and publishing
  - **Package Validation**: Comprehensive smoke testing for published artifacts
  - **Token Authentication**: Proper GitHub Packages authentication and permissions

  ### Enhanced Knowledge Hub Organization (#35)
  - **3-Level Guidelines Structure**: Reorganized guidelines into infrastructure, quality-assurance, technical-standards, and user-experience
  - **Comprehensive Documentation**: Added detailed guidance across all technical areas
  - **Improved Navigation**: Updated internal links and documentation structure
  - **Quality Assurance**: Added PR QA checklist and audit reports

  ## 📚 Documentation & Support (#24)

  ### Complete Support Infrastructure
  - **Installation FAQ**: Categorized troubleshooting for common installation issues
  - **Support Documentation**: Clear escalation paths and contact information
  - **Diagnostic Tools**: Automated environment diagnostic script (`scripts/diagnose-install.sh`)
  - **Platform Coverage**: Comprehensive guidance for macOS/Linux/Windows permission issues
  - **Environment Management**: Support for nvm/volta Node version conflicts
  - **Network Issues**: Offline and network-restricted installation options

  ### Enhanced CLI Documentation
  - **Updated README**: Added comprehensive Support & FAQ sections
  - **Getting Started**: Improved documentation and links in root README
  - **Link Validation**: Extended CI workflow for documentation link checking

  ## 🔧 Technical Improvements

  ### CLI Enhancements
  - **Diagnostic Logging**: Added `PAIR_DIAG` environment variable for troubleshooting
  - **Release Detection**: Improved knowledge-hub dataset path resolution
  - **Error Handling**: Better error messages and diagnostics
  - **Configuration**: Enhanced config validation and loading

  ### Development Workflow
  - **Automated Publishing**: GitHub Packages integration in release workflow
  - **Quality Gates**: Comprehensive testing and validation pipeline
  - **Artifact Verification**: Smoke testing for both manual and npm artifacts

  ## 🏗️ Infrastructure

  ### Package Management
  - **Registry Configuration**: Added GitHub Packages publishConfig
  - **Metadata Validation**: Enhanced package.json with proper registry settings
  - **Distribution Modes**: Support for both manual ZIP and npm package distribution

  This release significantly improves the CLI distribution infrastructure, provides comprehensive user support resources, and establishes a robust foundation for future development with enhanced documentation and automated publishing workflows.

### Patch Changes

- Updated dependencies
  - @pair/knowledge-hub@0.2.0

## 0.1.0

### Minor Changes

- 324000b: v0.1.0-team-adopter.1 — Internal alpha (CLI only)

  Summary
  - This is an internal alpha release of the `pair` CLI for team testing and feedback.
  - Not a public release and not v1 — intended for rapid iteration by internal testers.

  What’s included
  - `@pair/pair-cli` (CLI): initial feature release for installing and managing documentation/knowledge assets.
  - This changeset does NOT publish private workspace packages (`@pair/knowledge-hub`, `@pair/content-ops`) to npm. The knowledge dataset may be included in the manual bundle (ZIP) distributed with this release.

  High-level changelog
  - `@pair/pair-cli` bumped (minor): initial internal alpha feature set and CLI packaging.

  How to get and verify the artifact
  - Preferred (manual bundle): download the attached ZIP (example name: `pair-cli-manual-v0.1.0-team-adopter.1.zip`) and verify the checksum file `pair-cli-manual-v0.1.0-team-adopter.1.zip.sha256`.
  - To run locally after extracting the bundle:
    - Unix/macOS: `./pair-cli --help` `./pair-cli install --list-targets` `./pair-cli --version`
    - Windows: `pair-cli.cmd --help`

  Suggested tests (what to exercise)
  - CLI sanity: `--version`, `--help`, `install --list-targets`.
  - Install flow: run `pair-cli install` in a disposable folder and inspect created files.
  - Update flow: run `pair-cli update` against an existing install and verify link correction/overwrites.
  - Config validation: `pair-cli validate-config` with default and malformed configs.
  - Edge cases: non-empty target folder behavior, missing source paths.

  Known limitations
  - Internal alpha: expect UX rough edges, incomplete error messages, and possible breaking changes in subsequent releases.
  - Dataset/manual bundle is a separate artifact and is not an npm package bump for private workspace packages.

  Artifact naming guidance
  - Artifact: `pair-cli-manual-v0.1.0-team-adopter.1.zip`
  - Checksum: `pair-cli-manual-v0.1.0-team-adopter.1.zip.sha256`

  Contacts & reporting
  - Contact: see `author` in `apps/pair-cli/package.json` or open issues in this repository. Include OS, command, output, and artifact checksum when reporting bugs.

### Patch Changes

- @pair/knowledge-hub@0.1.0
