# ADR-022: The coverage-baseline ratchet is EXPOSED through the published CLI, not ported to a shipped shell asset

## Status

Accepted

## Date

2026-08-24

## Context

- Story #372 (PR #405) shipped the coverage-baseline **ratchet** — the opt-in commit-back half of the coverage guardrail — and documented it in the adopter-facing KB: the nested `Coverage baseline commit-back` flag, the push-not-PR trigger, the bot-PR landing, the `COVERAGE_RATCHET_TOKEN` credential.
- The capability, however, was **pair-internal**. The logic lived in `packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts` and the only way to run it was `pnpm --filter @pair/knowledge-hub coverage:ratchet` — a workspace filter inside pair's own monorepo. `/setup-gates` never asked about the flag and never emitted a step. An adopter who wrote `Coverage baseline commit-back: enabled` therefore got a **silent no-op**: config on, docs describing behaviour, nothing running, nothing complaining. #405 closed the honesty gap by stating the pair-internal scope; story #409 closes the capability gap, and this decision is its gate (#409/T-1).
- The other half of the guardrail, [`coverage-gate.sh`](../../../knowledge/assets/coverage-gate.sh), ships as a **provider-agnostic shell asset** in the KB, alongside `tier-resolve.sh`, `pr-state.sh` and `pr-tree-resolve.sh`. The ratchet was the only member of that family that was not reachable by an adopter, which is what makes "port it into the family" the obvious-looking answer.
- Two adoption records constrain the answer in opposite directions:
  - ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](../../decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md): gate/tooling logic worth testing lives in an importable module, white-box unit-tested; scripts are thin entrypoints and are **never** unit-tested. ADL [2026-07-30-coverage-ratchet-pr-not-push.md](../../decision-log/2026-07-30-coverage-ratchet-pr-not-push.md) applied it to this very capability, rejecting persistence inside the shell gate on the grounds that "its logic belongs in a tested module, not in the shell asset".
  - ADL [2026-08-13-tree-resolution-ships-as-an-executable-asset.md](../../decision-log/2026-08-13-tree-resolution-ships-as-an-executable-asset.md): shared CI machinery ships as an executable shell asset verified by the smoke suite, because shell asserted as *text* is shell nobody ever ran.
- What the ratchet actually contains matters for the choice: ~85 unit-asserted properties over nine review rounds, including several that exist because getting them wrong is silent — the two-slot `GIT_CONFIG_*` reset that makes git send exactly ONE `Authorization` header, the transient `--force-with-lease` refspec, the whole-subject anchoring of the merge-commit loop guard, and the never-clobber check against **both** the base branch and the open ratchet branch.
- The story's own business rule fixes the shape of the answer whichever mechanism wins: **one implementation, not two** — the adopter's step and pair's own step must run the same logic, because "a ported copy is a drift source".

## Options Considered

### Option 1: Port the ratchet to `.pair/knowledge/assets/coverage-ratchet.sh` and delete the TypeScript module

- **Description**: Rewrite the skip predicate, the monotonic arithmetic, the in-place config edit, the refusal classification and the git/gh sequence in bash; ship it in both knowledge corpora next to `coverage-gate.sh`; have pair's own CI step source the shipped asset; verify it with the smoke suite.
- **Pros**: The adopter needs nothing but the KB they already installed — no Node, no npm, no network. Puts the ratchet in the same family as its sibling assets, with the same verification story (2026-08-13). "The same shape pair runs" becomes literal: same file, same command.
- **Cons**: It is a **rewrite of a credential-handling, force-pushing write path**, three weeks after it landed, replacing ~85 white-box assertions with smoke coverage — several of the properties above are not expressible against a shell script without a stub-`gh`, env-dumping harness far larger than the port itself. It also contradicts the ADL that governs this exact module (gate logic in a tested module), so the deletion must be paid for twice: once in verification, once in decision consistency. And crucially, **it buys no portability**: the ratchet reads `GITHUB_EVENT_NAME`/`GITHUB_REF_NAME` and opens the PR with `gh`, so a bash version is exactly as GitHub-specific as the TypeScript one. Only the interpreter would change.

### Option 2: Ship the module as a self-contained Node asset in the KB (`assets/coverage-ratchet.mjs`)

- **Description**: Move the implementation into the shipped corpus as plain JavaScript with JSDoc types, run it with `node .pair/knowledge/assets/coverage-ratchet.mjs`, and keep the unit tests by importing the asset from a package test.
- **Pros**: One file, installed with the KB, run identically by pair and by adopters; the unit suite survives.
- **Cons**: Drops the module out of `tsc`'s and ESLint's reach — the KB corpora are documentation trees, not compiled sources — so a 1,000-line program with a credential path would ship with **no type checking and no lint**. It also puts an executable Node program into a tree whose tooling (link checks, mirror guards, the corpus scanners) treats every file as prose-or-shell.

### Option 3: Declare an extension point and let the adopter supply the implementation

- **Description**: `/setup-gates` asks the nested question and emits a step that invokes a project-declared command (`PAIR_RATCHET_CMD`), documenting the contract pair's own step satisfies.
- **Pros**: Trivial to ship; no new distribution surface.
- **Cons**: Fails the story's own acceptance: the emitted step would not be "the same shape pair runs", and an adopter who enabled the flag would get a *loud* no-op instead of a silent one. Louder, still not working.

### Option 4: Expose the existing module through the published CLI (chosen)

- **Description**: The implementation stays one unit-tested TypeScript module and moves to `apps/pair-cli/src/commands/coverage-ratchet/ratchet.ts`, behind a new `pair coverage-ratchet` command (metadata + parser + thin handler). `/setup-gates` emits a step that invokes it with a pinned `npx --yes @foomakers/pair-cli@<version>`; pair's own CI step invokes the same command from the dist it built earlier in the job.
- **Pros**: No logic is rewritten and no assertion is lost — the drift the business rule forbids is structurally impossible, because there is only ever one implementation. The CLI is pair's **existing** distribution channel to adopters, and generated adopter-facing shell already shells out to it with a pinned `npx` (`scaffold-kb`'s `release.sh`, `PAIR_CLI` override). Argument validation gains a real parser: a malformed invocation exits non-zero where the hand-rolled argv loop was untested.
- **Cons**: Widens the published CLI surface with a command a human will rarely type (it is CI machinery), and makes the adopter path depend on Node + npm availability in their pipeline — honest, but a dependency the shell assets do not have. The module also crosses a package boundary: it leaves the KB-tools package for the CLI app.

## Decision

**Option 4 — expose, do not port.**

Three reasons, in order of weight:

1. **Porting buys language, not portability.** The one property that would justify paying for a rewrite — "any stack, no runtime dependency", which is exactly why `coverage-gate.sh` is shell — is not available here: the ratchet is bound to `gh` and to GitHub's event/ref environment by its own decided design (2026-07-30). A bash ratchet would be just as GitHub-specific, so the rewrite's whole return would be the interpreter.
2. **The verification is the asset.** The ADL that governs this module puts its logic in a tested module precisely because the properties that keep it safe are silent when broken. Trading ~85 executed assertions on a credential and force-push path for prose-and-smoke is a *regression in safety*, sold as consistency of file extension. 2026-08-13 is not the counter-precedent it looks like: it moved shell that was ALREADY shell out of a skill and into an executable, so it gained execution; here the same move would lose it.
3. **One implementation is achievable without either compromise.** A published command is a thin entrypoint over the module — the shape the gate-tooling ADL prescribes — and pair's own step runs that same command, so pair dogfoods the adopter's path rather than a parallel one.

**What ships as a consequence, and what deliberately does not:**

- The KB gains **no** `coverage-ratchet.sh`. The guideline instead states plainly what the generated step invokes, and which parts of the mechanism are GitHub-Actions-specific rather than implying a portability the step does not have.
- The generated step **pins the CLI version** (`npx --yes @foomakers/pair-cli@<version>`), following the generated release script: a pipeline generated today and one generated in six months behave identically, and an unpinned `@latest` never enters an adopter's CI.
- The default stays `disabled` everywhere. This decision makes enabling the flag *work*; it turns it on for nobody.

## Consequences

### Benefits

- `Coverage baseline commit-back: enabled` now does what the KB says it does, for an adopter, through a command they can also run by hand to see the plan (`--dry-run`).
- One implementation, two thin invocations (pair's dist, the adopter's `npx`). There is no ported copy, so there is nothing to drift.
- Every property #372's review established is still asserted, and the wiring gained coverage it did not have: the parser is unit-tested (the old hand-rolled argv loop was not), and the smoke scenario now exercises the **adopter's** command — including the `--help` discoverability that makes the silent no-op impossible to reintroduce unnoticed.
- Argument errors are loud (non-zero) while every refused write stays a warning and exit 0, so the independence of gate verdict and persistence survives the move (#372/AC6) and is now stated as a two-sided exit contract in the CLI spec.

### Trade-offs and Limitations

- **The adopter's pipeline needs Node and npm** to run the step (GitHub-hosted runners have both; a self-hosted or non-Node runner needs them provisioned). This is stated in the guideline rather than glossed.
- **The published CLI carries a CI-only command.** It is documented as such; `pair --help` gains a line that most humans will never use.
- **Package boundary moved**: the ratchet leaves `@pair/knowledge-hub`'s tools (a KB-corpus toolbox, none of which is shipped to adopters as code) for the app that is actually published. This is ADR-014's stated forcing function — "a concrete workspace-dependency consumer" — arriving for this tool: it is no longer repo tooling, it is a shipped capability.
- **If a non-GitHub host ever needs the ratchet**, the substitution point is the pull-request call inside the module, not an env-var contract. That work is not done here and is not pretended to be.
- Because the command is user-facing on a published package, it carries a changeset (ADL 2026-08-20); the release itself stays the maintainer's call.

## Adoption Impact

- [way-of-working.md](../way-of-working.md): the `Coverage baseline commit-back` sub-flag's bullet gains the invocation an adopter's step uses (the shipped `coverage-ratchet` command) instead of implying pair's internal script. The framework default (`disabled`) and pair's own state (`disabled`) are unchanged.
- [tech/coverage-baseline.md](../coverage-baseline.md): the opt-in ratchet note gains the command name, so the file that documents the baseline says how a raise is proposed.
- [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md) (+ dataset twin): the pair-internal caveat is **removed** (it describes a limitation this decision ends), the commit-back gains **its own `push`-triggered workflow section** — deliberately NOT a step in the `pull_request`-triggered gate, where it could never write — and the Actions-specific parts are named.
- [coverage-config-example.md](../../knowledge/assets/coverage-config-example.md) (+ dataset twin): same caveat removal, plus the adopter's credential scope stated as theirs to provision.
- [setup-gates](../../../../.claude/skills/pair-capability-setup-gates/SKILL.md) (+ dataset twin): asks the nested question only when the parent guardrail is enabled, records the flag, and emits the **separate push-triggered workflow** — never a step of the pull-request gate, where it could not write — only when it is on.
- No context-map change: this is a packaging/distribution decision inside `Integration & Process Standardization`, already the bounded context of both the gate tooling and the CLI's KB-lifecycle commands.
