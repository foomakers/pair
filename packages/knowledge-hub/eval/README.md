# Skill Trigger Eval

Trigger/effectiveness eval harness for the skill corpus (story #313, T7). It measures whether the
frontmatter `description` of each skill in `packages/knowledge-hub/dataset/.skills/**` routes an
LLM executor to the right skill — the experiment behind principle 9 ("Evaluation") of the
authoring standard (`apps/website/content/docs/contributing/writing-skills.mdx`): a description
rewrite is a hypothesis; this eval is the experiment.

## Contents

- `trigger-prompts.json` — should-trigger / should-not-trigger prompt sets, one entry per skill
  family. Every skill has at least one should-trigger prompt; near-miss prompts name the sibling
  skill they are a decoy for (`near_miss_for`) and the correct destination (`expected`, `none`
  when no skill applies).
- `results/` — committed evidence, one file per run, named `YYYY-MM-DD-<label>.md`.

## Procedure

1. **Build the catalog** — extract the current name+description pairs (descriptions only, no
   skill bodies):

   ```bash
   for f in packages/knowledge-hub/dataset/.skills/next/SKILL.md \
            packages/knowledge-hub/dataset/.skills/*/*/SKILL.md; do
     awk '/^---$/{c++; next} c==1 && (/^name:/ || /^description:/)' "$f"; echo
   done
   ```

2. **Run each prompt in a fresh session** — triggering is a cold-start behavior; conversation
   history invalidates the result. Present the executor with the full catalog and one prompt, and
   ask: *"Given only these skill names and descriptions, which single skill would you load for
   this request? Answer `none` if no skill applies. If two or more descriptions claim the prompt
   equally, name all of them."*

3. **Record per prompt** — id, expected, selected, verdict:
   - `PASS` — selected matches expected.
   - `AMBIGUOUS` — executor names two or more candidates (counts against the corpus: two
     executors could disagree).
   - `FAIL` — selected differs from expected.

   Record honestly, including near-ties resolved by a judgment call (`PASS` with a note).

4. **Summarize** — pass rate per prompt type (should-trigger / should-not-trigger), list of
   ambiguities/failures with the competing descriptions, methodology statement (model, passes,
   executor identity). Commit the file under `results/`.

## Before/after comparison (gating a description rewrite)

When a skill's description changes (e.g. T3 of #313):

1. Run the full set against the **old** descriptions (or reuse the latest committed baseline if
   descriptions are unchanged since).
2. Apply the rewrite; run the same set against the **new** descriptions, same procedure, fresh
   sessions.
3. Compare per skill. **A regression on any prompt reverts that skill's description** — iterate
   on the description, not on the eval. Improvements on previously ambiguous/failing prompts are
   the acceptance evidence.
4. Commit both result files; reference them in the PR.

## Maintaining the prompt set

- New skill ⇒ add at least one should-trigger prompt and one family near-miss.
- Keep prompts realistic user phrasing, not description echoes — a prompt that quotes the
  description verbatim tests nothing.
- Prompts are grounded in current descriptions; when a trigger branch is added or removed, add or
  retire the matching prompts in the same PR.

## Related gates

Static conformance (frontmatter portability, size limits, pointer resolution, catalog counts) is
enforced separately by `pnpm skills:conformance` (`src/tools/skills-conformance-check.ts`, run
via `ts-node`), wired into `quality-gate` and CI.
