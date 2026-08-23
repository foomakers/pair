# Decision: verify-quality's tree/PR-state resolution ships as an executable, smoke-tested asset — not as shell inlined in a skill

## Date

2026-08-13

## Status

Active

## Category

Convention Adoption

## Context

Story #382 gave `/pair-capability-verify-quality` a `$pr` argument and, with it, a Step 1.5 that resolves two independent things before any gate runs: WHICH PR the `risk:*` tags come from, and WHICH CODE the suites actually ran against (the report's `Tree:` row, whose resolved value `/pair-process-review` Step 2.1 keys its authoritative-vs-advisory rule on).

That resolution grew, over nine review rounds, into ~90 lines of shell written inline in `dataset/.skills/capability/verify-quality/SKILL.md`: the identifier normalization (bare number / `#420` / three URL shapes), the single code-host read, the head-COMMIT compare with its `match` / `ahead` / `mismatch` arms, the no-remote skip, the two `unknown` spellings, and the six rendering arms. Every property of it was verified as **text** — `verify-quality.test.ts` grepped the fenced block for a spelling, an ordering, a banned emptiness test. Nothing ever executed it. The round-9 finding (a corpus guard that walked `.md` only and therefore never saw a shipped `.sh`) is the same class of miss: an artifact claimed a property that only a run could have falsified.

The two sibling helpers in the same flow — `tier-resolve.sh` (the tier→suite matrix CI and the skill share) and `pr-state.sh` (the gate≠review synthesis) — already ship as executable assets under `.pair/knowledge/assets/`, precisely so the recipe and the tests read the same text and the behavior is smoke-tested. The tree/PR-state resolution was the odd one out. The repository owner asked for the extraction explicitly: "estrai e testalo cosi' e' piu' sicuro".

## Decision

1. **The tree/PR-state resolution ships as `.pair/knowledge/assets/pr-tree-resolve.sh`** (dataset + installed KB, byte-equal), next to `pr-state.sh` and `tier-resolve.sh` and in the same style: provider-agnostic, state/tags only, no classification criteria (D18), always exit 0.
2. **Five entry points**, so each property is independently runnable: `normalize_pr_id`, `local_tree`, `pr_view_json` (the ONE code-host read), `resolve_pr_tree` (assigns `TREE_MATCH`, `LOCAL_TREE`, `PR_ARG`, `PR_NUM`, `PR_HEAD_REF`/`PR_HEAD_SHA`, `PR_LABELS`, `PR_READ_OK`/`NO_PR_ON_BRANCH`/`NO_CODE_HOST`, `AHEAD_N`), and `render_tree_row` (the executable projection of the report's `Tree:` arms).
3. **The code-host substitution point is a FUNCTION override, not a fork**: `pr_view_json` is defined only if the caller has not already defined it, and is bound at call time — so a non-GitHub host (or a test) replaces the one read and nothing else changes. This is what makes the routing-table instruction executable instead of aspirational.
4. **`PR_LABELS` is the hand-off to `tier-resolve.sh`**: the one read that resolves the tree also carries the labels, so the tier side consumes them with no second round trip — and `resolve_tier` already documents `PR_LABELS` as its input.
5. **The split is tree/state vs. tier**: the skill keeps inline exactly the tier half — the precedence, the six distinct `REASON`s, the `TIER_SOURCE` arms, the story-card fallback — because that is the skill's own decision procedure, not shared machinery. The skill sources the asset and states the contract; it no longer restates the shell.
6. **Verification follows the gate-tooling ADL (2026-07-13)**: the asset's BEHAVIOR is executed by `scripts/smoke-tests/scenarios/pr-tree-resolve.sh` (`OFFLINE_SAFE`, real git repositories + a stubbed host read), registered in `lib/ci-tests.sh`'s `CI_TESTS` array (extracted from `run-all.sh` by #400, which also wired the `smoke` job in `.github/workflows/ci.yml` to run `run-all.sh --ci --cleanup`); `verify-quality.test.ts` keeps only CONTENT invariants, now read from the file the step sources. **#400 has landed**: the scenario now runs in CI on every PR, in addition to the gate/local run `pnpm smoke-tests` (`run-all.sh --cleanup`, `IS_CI=false`, globs `scenarios/*.sh` rather than consulting `CI_TESTS`) and the custom-gate execution `/pair-capability-verify-quality` performs because the file exists in `scenarios/`. A break in any arm is therefore CI-enforced, not merely gate/local-enforced as it was before #400 (conformance-pinned in both directions: the claim tracks whichever mechanism is real, and may not overstate it either way).

## Alternatives Considered

- **Leave the shell inline and keep asserting it as text**: rejected — it is the status quo that produced nine rounds of text-level fixes on code no test could run. A conformance grep cannot tell `git merge-base --is-ancestor` from a plausible-looking line that never fires.
- **Extract the whole of Step 1.5, tier arms included**: rejected — the precedence and the reasons ARE the skill's decision procedure (which source may be consulted, what each failure must say). Moving them into an asset would leave the skill unable to state its own rules, and would make a project-specific PM-tool substitution (`gh issue view`) a shipped-script concern.
- **Unit-test the asset from vitest (spawn/source it)**: rejected — the gate-tooling ADL forbids unit-testing scripts; shipped shell is verified end-to-end by the smoke suite, which is also where `pr-state.sh` and `tier-resolve.sh` are executed.
- **A `PAIR_PR_READ_CMD` environment variable as the substitution point**: rejected — an env-named command cannot express the per-host field mapping (`headRefName`/`headRefOid` → the host's own spellings) that the read must also carry; a function override does, and needs no new convention.
- **One copy in the dataset only**: rejected — the `.claude/skills` mirror links `../../../.pair/knowledge/assets/…`, which resolves to the INSTALLED tree; a single copy would leave the installed agent following a dead link.

## Consequences

- `/pair-capability-verify-quality` Step 1.5 point 1 is now three lines of composition plus a stated contract; the resolution it runs is the same text the smoke test executes.
- Adding or changing an arm means changing one file and one scenario — the previous shape required editing the skill, the mirror, and the greps that stood in for a test.
- A new code host is wired by overriding `pr_view_json`; the routing-table instruction now names a function instead of describing a rewrite.
- The KB gains a third shipped shell asset; the "one executable projection" rule (already stated for `tier-resolve.sh` and `pr-state.sh`) now covers every deterministic piece of the local gate run.
- Conformance moved with the code: assertions about the shell read `pr-tree-resolve.sh`, assertions about the decision procedure read the SKILL. Neither was relaxed.

## Adoption Impact

- No adoption-file change: this decision is internal to the KB's shipped assets and follows the existing gate-tooling ADL ([2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md)), whose smoke-test clause it applies rather than amends. `way-of-working.md`'s Quality Gates section already points at that ADL for gate/tooling code.
- Complements (does not amend) [2026-08-11-verify-quality-pr-argument-names-the-pr-not-the-tier.md](./2026-08-11-verify-quality-pr-argument-names-the-pr-not-the-tier.md): that ADL owns WHAT is resolved and with which precedence; this one owns WHERE that resolution lives and how it is verified.
- Dataset/KB: new `assets/pr-tree-resolve.sh` in both knowledge trees; `verify-quality/SKILL.md` sources it; `scripts/smoke-tests/` gains `pr-tree-resolve.sh` and its registration in `lib/ci-tests.sh`'s `CI_TESTS` array. That list is read by `run-all.sh --ci`, which the `smoke` CI job now invokes on every PR (#400); the gate/local `pnpm smoke-tests` run still does not consult it and executes the scenario by globbing `scenarios/` instead (see decision 6).
