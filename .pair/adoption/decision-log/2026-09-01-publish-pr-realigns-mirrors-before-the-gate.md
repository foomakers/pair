# Decision: `/pair-capability-publish-pr` realigns the mirrors BEFORE its gate, through an adoption-declared command

## Date

2026-09-01

## Status

Active

## Category

Process Decision

## Context

Story #419 replaces `pair update` with a dedicated, local, deterministic realignment command
(`pnpm mirrors:regenerate`) as the remedy every mirror-equality guard names, and puts the write at
the point where a commit is still possible: pull-request creation. Two things had to be decided
before the step could be written into `/pair-capability-publish-pr`.

**1. Where in the skill's phase order it runs.** The story's card proposed Phase 2 ("Resolve Merge
Strategy & Prepare Base"), *after* Phase 1's quality gate. That ordering does not survive contact
with the failure it exists for: mirror drift is exactly what turns Phase 1 red, and a red Phase 1
**HALTs** the skill. The remedy would therefore be unreachable in the only case it was added for.
The reverse ordering has a second, independent justification: a gate that ran before the
regeneration judged a tree the PR no longer contains.

**2. Whether the command is named in the skill.** `/pair-capability-publish-pr` ships to every project that installs
the pair corpus. `pnpm mirrors:regenerate` is a script of *this* repository — a skill that hardcoded
it would emit a step no adopter can run, on a repo with no mirrors to realign.

**3. How the skill decides what to stage.** The first draft staged "the generated paths the command
owns", resolved through the owned-path globs this file declares. Review found that unsound: root
`.pair/**` is on that list and holds 117 tracked *authored* files under `.pair/adoption/**`
(`git ls-files .pair/adoption | wc -l` → 117). A contributor who edits
`.pair/adoption/tech/way-of-working.md`, leaves it unstaged and runs the skill — the state this very
PR was in — would have their prose committed under `chore: regenerate mirrors from local dataset`,
contradicting the same phase's "unstaged authored changes must survive the run untouched".

**4. Where a script's own behaviour is tested.** ADL
[2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md)
forbids black-box `spawnSync`/`exec` of a script inside a vitest unit test and routes CLI-level
verification to `scripts/smoke-tests/`. `scripts/regenerate-mirrors.sh` is a *thin wrapper whose
behaviour is the entire deliverable* — there is no module to extract, because the story's own
constraint is "no new generation logic". `run-format.test.ts` already deviates the same way and the
deviation was nowhere recorded, so the repo's adoption said one thing and two of its test files did
another with nothing telling the next author which wins.

## Decision

**The realignment runs first inside Phase 1, ahead of `/pair-capability-verify-quality`, and the command it runs is
read from the adoption, never named in the skill.**

- Phase 1 is renamed **"Realign Generated Mirrors, then Quality Gate (BLOCKING)"**. The realignment
  is steps 1–4; the gate composition is step 5 onward, unchanged.
- The command comes from `way-of-working.md` → `## Quality Gates` → **`mirror-realign-command`**.
  **Absent ⇒ the whole step is skipped** — the zero-configuration default, not a degradation: a
  project with no generated mirrors has nothing to realign and must not be told to run a script it
  does not have.
- The step commits **only** the generated paths, as **its own commit**, and only when the command
  produced a diff. A no-op is **silent**: no commit, and no output row (the `Mirrors:` row is
  emitted only when a commit was made).
- **The staged set is the command's own effect, not a path glob.** The skill snapshots
  `git status --porcelain -z` before running the command and again after, and stages exactly the paths
  whose entry appeared, disappeared or changed. A glob is a guess about the command and is wrong
  wherever generated output and authored files share a prefix; the comparison cannot be, because a
  file the run did not touch has an identical entry in both snapshots. Corollary: **no adopter has
  to enumerate owned globs anywhere**, and this file's own list of written trees is descriptive
  only.
- **The comparison is content-aware on paths that were ALREADY dirty**, because a porcelain entry
  encodes status, not content. The before snapshot therefore carries a digest
  (`git hash-object -w`) of every dirty path **whose worktree file exists**, read from
  `git status --porcelain -z --untracked-files=all`, and the staged set is the entries that
  appeared/disappeared/changed **plus the pre-dirty paths whose digest moved**. Without it: HEAD
  carries a drifted mirror, the contributor holds an uncommitted edit to that same file, the
  command regenerates it — the same unstaged-modified `M <path>` entry on both reads — and a
  status-only comparison reads NO CHANGE, so the hand-edit is destroyed with nothing reported
  *and* the stale mirror is
  pushed, turning the branch's own conformance job red. Measured against the real script in
  `regenerate-mirrors.test.ts` ("overwrites a pre-dirty mirror while `git status --porcelain` stays
  byte-identical").
- **The snapshot is read NUL-separated (`-z`), because the default format is not a list of paths**
  (round-4 review, measured in a scratch repo). Porcelain v1 quotes and octal-escapes any path with
  a space or a non-ASCII byte: ` M "with space.md" `, ` M "caff\303\250.md" ` — the path field read
  off such an entry is not a filename, fails the file-exists test, and is dropped from the digest
  in silence. That is the same status-vs-content blindness the digest closes, re-entering through
  the parser: a generated `docs/My Guide.md` already carrying a hand-edit is overwritten with an
  unchanged entry on both reads and no digest, so the run reads NO CHANGE — hand-edit gone with no
  `recover:` row, regenerated bytes never staged, stale mirror pushed. The reverse shape costs the
  step outright: a new generated file with a space is caught by status and then
  `git add '"with space.md"'` fails as a pathspec. `-z` prints raw bytes, never quoted, so the
  snapshot is **split on NUL** (a filename may contain a newline) and a rename entry's `<old>`
  arrives as a second field to be consumed, not read as an entry — which is also what removes the
  `old -> new` ambiguity of the default rename line. Measured in
  `regenerate-mirrors.test.ts` ("the snapshot recipe sees a path with a space and a non-ASCII byte
  — the default parse does not").
- **The regeneration commit is made by PATHSPEC, never by a bare `git commit`** (round-4 review,
  measured). The staging rule protected *unstaged* authored work, but `git add <paths>` followed by
  a plain `git commit` commits the whole INDEX: with `M  authored.md` staged and ` M mirror.md `
  regenerated, the resulting commit lists both — the contributor's prose under
  `chore: regenerate mirrors from local dataset`, a commit they never wrote. It is the harm the
  whole staging-rule section exists to prevent, reached through the index instead of through a
  glob, and it is ordinary: this skill is standalone, explicitly runs on a dirty tree, and a
  resumed/interrupted `/pair-process-implement` leaves a populated index. The step-4 Verify catches
  it only *after* the commit exists, and a Verify failure is not a HALT condition — so the
  mislabelled commit would be pushed. `git commit -m "…" -- <paths>` commits only the pathspec and
  leaves the staged entries staged and untouched. The pathspec replaces the index as the commit's
  **scope**, not the `git add` as its **step**: a pathspec resolves against paths git already knows
  (index or HEAD), so a mirror the run CREATED — `?? <path>`, the shape a contributor produces by
  adding a file to the dataset, the one case a published-KB install cannot serve — is
  `error: pathspec '<path>' did not match any file(s) known to git`, exit 1, and the commit aborts
  whole, leaving the branch to push without the mirror it just regenerated. A modified or deleted
  tracked path DOES commit by pathspec while unstaged, which is why a dropped `git add` looks
  harmless until the first new mirror — so the recipe states both the step and the asymmetry.
  Measured end to end against the real script in `regenerate-mirrors.test.ts` ("stages a newly
  created mirror before committing it — a pathspec alone cannot name it").
- **Each of the three remaining rules in the snapshot recipe is load-bearing** (round-3 review,
  measured in a
  scratch repo): `--untracked-files=all`, because the default reports a not-yet-committed directory
  as one `?? dir/` entry — identical on both reads whatever the run wrote inside it — and
  `git hash-object dir/` is `fatal: Unable to hash dir/`, i.e. the same blindness the digest closes,
  surviving where the digest cannot reach; **file-exists scoping**, because `git hash-object` on a
  ` D ` entry is `fatal: could not open … for reading` (exit 128) and this step's own
  non-zero → HALT would block the PR on a condition the snapshot pass created — safe to skip,
  since a recreated deletion *moves* its porcelain entry; and **`-w`**, because plain
  `git hash-object` discards the bytes it hashes.
- **The overwrite is reported *and* recoverable, never silent.** Those paths are committed like any
  other write (the regenerated content is what must ship), and each is named on the `Mirrors:` row —
  `overwrote uncommitted changes in: <path> (recover: git cat-file -p <sha> > <path>)`. The commit
  is not the remedy for the loss; the `-w` blob plus that line is. Naming a path the contributor
  cannot restore — the content is in no HEAD, no index, no disk — is only a better-documented loss.
  And the step-4 Verify reads the **digest** of every pre-existing dirty path not in the staged
  set **that still has a file on disk**, not `git status`'s listing: the listing is exactly what an
  overwrite also leaves behind, so a survival check phrased on it certifies the loss it exists to
  catch.
- **A thin script whose behaviour IS the deliverable may be exercised from vitest**, black-box,
  against a throwaway fixture — a bounded, documented exception to ADL 2026-07-13, which otherwise
  stands unchanged. Conditions, all of them: the script holds no logic that could be extracted to a
  module (extract it instead, per that ADL); the fixture is disposable and never the real repo; and
  the test asserts observable behaviour (exit status, stderr reason, files on disk), never the
  script's source text. The smoke suite is not the right home for these: `scripts/smoke-tests/`
  exercises the *published* CLI end to end, and these cases deliberately point `TOOLCHAIN_ROOT` at a
  broken tree (no turbo, a failing build, a build that writes no `dist/cli.js`) — situations a smoke
  scenario over a working installation cannot produce. Applies to
  `packages/dev-tools/src/quality-gates/regenerate-mirrors.test.ts` and, retroactively, to
  `run-format.test.ts`, which already had this shape unrecorded.
- **What the run REMOVED leaves the stageable set and is named** (round-6 review, measured against
  the real script). A `behavior: "mirror"` registry makes the target equal to the dataset, so a
  contributor's untracked `.pair/knowledge/wip-draft.md` is deleted and its `??` entry disappears —
  which puts it in the set — and `git add <path>` on it is `fatal: pathspec … did not match any
  files`, exit 128; the staged-new shape (porcelain `A.` → `AD`, `.` marking the blank column) passes `git add` (staging the removal) and
  fails the pathspec commit instead, exit 1, aborting every genuine regeneration in the same set.
  Phase 1 died *after* the destructive run, and the draft was destroyed with no report row (the
  overwrite row fires on a moved digest, not a vanished entry). Such paths go neither in `git add`
  nor in the pathspec and are named `removed untracked: <path> (recover: git cat-file -p <sha> >
  <path>)` from the before `-w` digest.
- **A staged set whose cached diff is empty is a no-op, not a failed commit** (round-6 review,
  measured). A path whose render already equals HEAD moves its entry when rewritten (`M.` → `MM`,
  `D.` → `D.` + `??`, `.M` → gone) yet equals HEAD in the index after `git add`; `git commit … --
  <paths>` over only such paths is `nothing to commit, working tree clean`, exit 1. The recipe now
  runs `git diff --cached --quiet -- <paths>` after staging: empty ⇒ no commit; and the recover rows
  are driven by the digest comparison alone, whether or not a commit was made — the two hand-edits
  in that case are gone from disk *and* index, so a row that waited for the commit would never
  name them. The Verify compares the commit's file list to `git diff --cached --name-only`, since a
  mixed set commits a subset.
- **Untracked files under the written trees HALT the step before the command runs** (round-6
  review, measured). The writer reads the whole target tree: under a mirror registry an untracked
  file is deleted; under the `add` registry (`.pair/adoption`) it survives but the CLI's
  `generateLlmsTxt` indexes it, so the committed `.pair/llms.txt` carries a dangling link and the
  contributor's private WIP filename. Bytes untouched, derived output leaked — the story's edge
  case held on bytes only. Since the harm is decided by *which* tree the file is under and the skill
  owns no globs, the check is scoped by the trees the adoption's `mirror-realign-command` entry
  names (descriptive, the same clause this file already carried), HALTs on any `??`/`A.` entry
  under them with the remedy `git stash push -u -- <paths>` / `git stash pop`, and is skipped when
  the adoption names none — a HALT here costs nothing, since nothing has been written yet, unlike
  the post-run HALT rejected below. Measured to its postcondition: stashed, the run leaves
  `llms.txt` untouched; popped, the note is back.
- A non-zero exit from the command **HALTs** before any PR side effect — the same shape as the
  gate-red HALT it now precedes.
- This project declares `mirror-realign-command: pnpm mirrors:regenerate`.

## Alternatives Considered

- **Step in Phase 2, after the gate (the card's proposal)**: unreachable on drift, because Phase 1
  HALTs first; and it would leave the gate's verdict describing a tree the PR does not contain.
- **Hardcode `pnpm mirrors:regenerate` in the skill**: makes a repo-specific script part of a
  distributed corpus. Every adopter would get a step that fails or does nothing.
- **Let the gate apply the fix itself**: declined already, by ADL
  [2026-07-31-pre-push-gate-is-check-only.md](./2026-07-31-pre-push-gate-is-check-only.md) — the
  gate reports, it never writes. This decision keeps that rule intact: the writer is an explicit,
  separately-committed step, not a hook side effect.
- **Fold the realignment into `pnpm format`**: the other option that ADL left open, and declined
  with it — formatting must stay formatting, and must not reach outside format scope.
- **Stage by owned-path glob (the first draft)**: rejected — see Context 3. The glob covers authored
  files in this repo, and any adopter would have to enumerate its own, correctly, for a rule whose
  failure mode is committing someone else's work.
- **HALT when the run overwrote a pre-dirty path**: rejected. The overwrite has already happened by
  the time it is detectable — the command ran — so a HALT recovers nothing the contributor lost, and
  it additionally blocks the PR on a condition this step itself caused, leaving the drift in place.
  Committing the regenerated content and *naming the loss* keeps both the mirror and the contributor
  informed; only the silence was the defect.
- **Move the script tests to `scripts/smoke-tests/`**: rejected — see Context 4. The suite would lose
  the broken-toolchain cases outright (a smoke scenario runs against a working install), and vitest
  is where the assertions and the fixture helpers already live.
- **Extract `regenerate-mirrors.sh`'s logic into a module and unit-test that**: rejected — there is
  no logic to extract. The script's content is argument resolution and five fail-loud guards over
  the filesystem and a subprocess; a module wrapping them would be tested through the same
  filesystem fixtures, one indirection further from what actually runs.

## Consequences

- `/pair-capability-publish-pr` commits on the contributor's behalf. That is acceptable **only** under the
  constraints above: generated content, its own commit, named as a *regeneration* (never a "fix" —
  an overwritten hand-edit was restored, not repaired), never `git add -A`, and never a bare
  `git commit` — so both the unstaged authored changes in the working tree and anything the
  contributor had already staged survive untouched.
- Drift in a file the branch never touched is committed here too, and reported. Surprising, but
  pushing knowingly stale generated output is worse.
- Running `/pair-capability-publish-pr` twice commits nothing the second time — the command is idempotent.
- A project that adopts the key inherits the behaviour; one that does not sees no change at all.

## Adoption Impact

- `adoption/tech/way-of-working.md` → `## Quality Gates`: declare `mirror-realign-command`
  (`pnpm mirrors:regenerate`), state the absent-⇒-skipped default, mark the written-tree list as
  descriptive rather than a staging rule, state the writer/checker scope asymmetry (the guards
  check the dataset-sourced mirrors; the command additionally rewrites skill references across the
  whole installed tree, which nothing verifies), and state that the writer reads the whole target
  tree — untracked files are deleted under mirror registries and indexed into `.pair/llms.txt`
  under the `add` one — so the run starts with none under the written trees.
- `adoption/tech/way-of-working.md` → `## Quality Gates` → "Gate & tooling code": record the bounded
  vitest exception above next to the rule it qualifies, so the two are read together.
- [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md):
  unchanged in force; its "scripts are never unit-tested" clause gains a pointer to this record's
  bounded exception.
- `packages/knowledge-hub/dataset/.skills/capability/publish-pr/SKILL.md`: Phase 1 renamed and
  extended, `Adoption Inputs` gains the key, `Output Format` gains the conditional `Mirrors:` row,
  `HALT Conditions` gains the command-failed HALT, `Graceful Degradation` gains the absent-key skip.
  The generated `.claude/skills/pair-capability-publish-pr/**` mirror is regenerated, never
  hand-ported.
