/**
 * The coverage ratchet has an ADOPTER PATH, and the corpus may not claim otherwise.
 *
 * Until ADR-022 the ratchet was pair-internal: the flag was documented, the
 * capability was not shipped, and `Coverage baseline commit-back: enabled` was a
 * silent no-op. #405 papered that over honestly, by stating the limitation in the
 * guideline and the config example. This guard exists because BOTH of those texts
 * are now wrong — and a caveat that outlives the limitation it describes is worse
 * than no caveat at all: it tells an adopter not to use a feature that works.
 *
 * So the assertions come in two directions, over BOTH knowledge corpora and BOTH
 * skill corpora:
 *   1. the caveat is GONE and cannot come back;
 *   2. what replaced it is actually there — the emitted step, the nested-question
 *      rule, and the credential the adopter provisions with what happens without it.
 *
 * The last group is the one that would otherwise rot silently: the KB documents
 * flags of a real CLI command, so the flags are checked against the command's own
 * metadata file. A renamed flag then fails HERE instead of failing in an adopter's
 * pipeline. The metadata is read as TEXT, not imported: this package has no
 * dependency on the CLI app, and a conformance guard should not create one.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET = join(__dirname, '..', '..', 'dataset')

/** Every corpus a claim about the ratchet can be made in: dataset source + installed mirror. */
const KNOWLEDGE_ROOTS = [join(DATASET, '.pair/knowledge'), join(REPO_ROOT, '.pair/knowledge')]
const SETUP_GATES = [
  join(DATASET, '.skills/capability/setup-gates/SKILL.md'),
  join(REPO_ROOT, '.claude/skills/pair-capability-setup-gates/SKILL.md'),
]

const GUIDELINES = KNOWLEDGE_ROOTS.map(root =>
  join(root, 'guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md'),
)
const EXAMPLES = KNOWLEDGE_ROOTS.map(root => join(root, 'assets/coverage-config-example.md'))
const GATES = KNOWLEDGE_ROOTS.map(root => join(root, 'assets/coverage-gate.sh'))

const read = (path: string): string => readFileSync(path, 'utf-8')
const label = (path: string): string => path.replace(REPO_ROOT, '').replace(/^\//, '')

/** The command's own option/name declarations — the source of truth the KB documents. */
const METADATA = read(join(REPO_ROOT, 'apps/pair-cli/src/commands/coverage-ratchet/metadata.ts'))

const COMMAND = 'coverage-ratchet'
const TOKEN = 'COVERAGE_RATCHET_TOKEN'

/**
 * Every fenced ```yaml block of a guideline, PARSED.
 *
 * String assertions are what let the first version of this guard pass while the
 * emitted step could never run: the step's text was right and the workflow it
 * sat in was triggered by `pull_request` only, so the ratchet's own
 * `not-base-push` skip refused every single run. A claim about WHEN a step runs
 * can only be checked against the document's `on:` — i.e. against a parse. This
 * is the generated-YAML rule of ADL 2026-07-29 applied to a workflow the corpus
 * tells an adopter to copy.
 *
 * Placeholders (`<base-branch>`, `<cli-version>`) are legal YAML scalars, so the
 * document parses as-is and no substitution is needed to read its trigger.
 */
function yamlBlocks(text: string): { source: string; doc: unknown }[] {
  return [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map(match => {
    const source = match[1] ?? ''
    return { source, doc: parse(source) }
  })
}

interface Workflow {
  on?: Record<string, { branches?: string[] } | null>
}

/**
 * The one workflow that carries the commit-back step.
 *
 * Exactly one: two blocks invoking the command would mean the guideline shows it
 * in a second place, and only one of them would be the one under assertion here —
 * the shape that let a `pull_request`-only step pass unnoticed.
 */
function ratchetWorkflow(text: string): { source: string; doc: Workflow } | undefined {
  const carrying = yamlBlocks(text).filter(block => block.source.includes(COMMAND))
  expect(carrying.length, 'exactly one YAML block may invoke the commit-back command').toBeLessThan(
    2,
  )
  return carrying[0] as { source: string; doc: Workflow } | undefined
}

/**
 * Shell variable references in a snippet — `${NAME}` / `${NAME:-default}` /
 * `$NAME` — excluding GitHub's own `${{ … }}` expressions, which the runner
 * substitutes before the shell ever sees them.
 */
function shellRefs(snippet: string): string[] {
  const withoutContexts = snippet.replace(/\$\{\{[\s\S]*?\}\}/g, '')
  const braced = [...withoutContexts.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)[:}-]/g)]
  const bare = [...withoutContexts.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)]
  return [...new Set([...braced, ...bare].map(match => match[1] as string))]
}

/** Variables the workflow assigns itself, plus the ones the runner always provides. */
function assignedIn(snippet: string): Set<string> {
  const assigned = [...snippet.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=/g)].map(m => m[1] as string)
  // `GITHUB_ENV` and friends come from the runner; `PAIR_RATCHET_*` are declared
  // in the step's own `env:` block, which this scan reads as assignments anyway.
  return new Set([...assigned, 'GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_WORKSPACE'])
}

// The exact sentences #405 shipped and this story removes. Matched on the CLAIM,
// not on a whole paragraph, so a reworded revival still fails.
const DEAD_CAVEATS = [
  /pair-internal/i,
  /silent no-op/i,
  /neither asks about this nested flag/i,
  /packages\/knowledge-hub\/src\/tools\//,
]

describe('the pair-internal caveat is gone from every corpus', () => {
  it.each([...GUIDELINES, ...EXAMPLES, ...GATES])('%s carries no dead caveat', path => {
    const text = read(path)
    for (const caveat of DEAD_CAVEATS) {
      expect(
        caveat.test(text),
        `${label(path)} still says the ratchet is unreachable (${String(caveat)}) — the limitation it describes is over`,
      ).toBe(false)
    }
  })

  it.each([...GUIDELINES, ...EXAMPLES, ...GATES, ...SETUP_GATES])(
    '%s cites no story number as the authority for the commit-back',
    path => {
      // A bare `#372` had no referent for the reader installing this corpus, and
      // "automated commit-back is story #372" went stale the moment it merged.
      expect(read(path)).not.toMatch(/#372/)
    },
  )
})

describe('what replaced it — the emitted step', () => {
  it.each(GUIDELINES)('%s emits a commit-back step invoking the shipped command', path => {
    const text = read(path)
    expect(text).toContain('Coverage baseline commit-back (opt-in)')
    expect(text).toContain(`${COMMAND} \\`)
    expect(text).toContain(TOKEN)
  })

  it.each(GUIDELINES)('%s pins the CLI version instead of tracking @latest', path => {
    const text = read(path)
    expect(text).toMatch(/@foomakers\/pair-cli@<cli-version>/)
    expect(text, 'a pipeline must not float to a release nobody read').not.toContain(
      '@foomakers/pair-cli@latest',
    )
  })

  it.each(GUIDELINES)(
    '%s puts the step in a workflow that actually RUNS on a base-branch push',
    path => {
      // The bug this exists for: the step's text can be perfect while the workflow
      // around it is triggered by `pull_request` only — and then the ratchet's own
      // `not-base-push` skip refuses every run, forever, silently. An adopter who
      // answered "yes" to the nested question would get exactly the opt-in-that-
      // does-nothing this story exists to remove. Only the parsed `on:` can tell.
      const workflow = ratchetWorkflow(read(path))
      expect(workflow, `${label(path)} has no YAML block containing the ratchet step`).toBeDefined()
      const on = workflow?.doc.on ?? {}
      expect(
        Object.keys(on),
        `${label(path)}: the ratchet workflow must be push-triggered — the commit-back only ever writes on a push to the base branch`,
      ).toContain('push')
      expect(
        Object.keys(on),
        `${label(path)}: a pull-request run must never reach the commit-back — it would mutate the PR head commit required checks are pinned to`,
      ).not.toContain('pull_request')
      expect(on['push']?.branches ?? []).toContain('<base-branch>')
    },
  )

  it.each(GUIDELINES)('%s defines every shell variable the ratchet workflow reads', path => {
    // The bug this exists for: the workflow passed `--measured "${TYPE:-default}=…"`
    // with `TYPE` defined NOWHERE in it, so a monorepo with per-type baselines
    // proposed `default=<pct>` on every push and the ratchet answered "no valid
    // committed baseline.default" forever — the same silent no-op as the original
    // Critical, narrowed to multi-type repos. An undefined variable in generated
    // shell is invisible to a text assertion and to YAML parsing alike.
    const source = ratchetWorkflow(read(path))?.source ?? ''
    const assigned = assignedIn(source)
    const undefinedRefs = shellRefs(source).filter(name => !assigned.has(name))
    expect(
      undefinedRefs,
      `${label(path)}: the ratchet workflow reads shell variables it never sets — a value the adopter cannot see is missing`,
    ).toEqual([])
  })

  it.each(GUIDELINES)('%s measures PER TYPE, as the config declares baselines', path => {
    // A repo with `baseline.backend` + `baseline.frontend` needs one `type=pct`
    // entry per type: a hardcoded `default=` can never raise either of them. This
    // is also the dimension where AC2 ("the same shape pair runs") bites — pair's
    // own step passes `shared=…,frontend=…`.
    const source = ratchetWorkflow(read(path))?.source ?? ''
    expect(
      source,
      'a hardcoded single-type measurement cannot raise a per-type baseline',
    ).not.toMatch(/--measured "default=/)
    expect(source).toMatch(/for .* in .*# the types/)
    expect(source).toMatch(/baseline\.<type>/)
  })

  it.each(GUIDELINES)('%s never lets a missing report abort ANY generated step', path => {
    // GitHub Actions runs `run:` blocks under `bash -e`, so `VAR="$(jq … )"` with
    // no report inherits jq's exit 2 and KILLS the step before the next line runs.
    //
    // The consequence differs per snippet and both are wrong:
    //   - post-merge ratchet: the "no usable coverage" warning under it becomes
    //     unreachable in the most common adopter state (a report path not adapted
    //     yet), and a workflow whose whole point is that it gates nothing goes red
    //     on the base branch on every push;
    //   - pre-merge `coverage` job: the step dies BEFORE `coverage_gate` is called,
    //     so the fail-safe this same guideline documents — "blocks at 🔴, warns at
    //     lower tiers" on an unmeasured report — is unreachable, and a 🟡 PR is
    //     blocked where the corpus promises a warning. It fails CLOSED, which is
    //     why it survived review twice: visible, but wrong.
    //
    // pair's own step has carried `|| true` all along, so this is also the last
    // shape difference between what pair runs and what it tells adopters to run.
    //
    // Scanned over EVERY yaml block, not just the ratchet workflow: the first
    // version of this assertion filtered blocks by the command name, so it could
    // not see the pre-merge job at all — the same "the guard cannot see it" hole
    // that let the trigger bug through in round 1.
    const source = yamlBlocks(read(path))
      .map(block => block.source)
      .join('\n')
    const substitutions = source
      .split('\n')
      .filter(line => /^\s*[A-Za-z_][A-Za-z0-9_]*="\$\(/.test(line))
    expect(
      substitutions.length,
      'no command substitution found — repoint this test',
    ).toBeGreaterThan(0)
    for (const line of substitutions) {
      expect(
        line,
        `${label(path)}: this assignment aborts the step under \`bash -e\` when the command fails:\n${line.trim()}`,
      ).toMatch(/\|\| true\)/)
    }
  })

  it.each(GUIDELINES)('%s skips the write when nothing was measured', path => {
    // `--measured ""` is a malformed invocation and exits non-zero by design, so a
    // run that measured nothing must not invoke the command at all — otherwise a
    // workflow that gates nothing goes red on the base branch for a non-event.
    const source = ratchetWorkflow(read(path))?.source ?? ''
    expect(source).toMatch(/if: env\.PAIR_MEASURED != ''/)
  })

  it.each(GUIDELINES)('%s binds the credential to that workflow, not to a gate job', path => {
    // Least privilege in the EVENT dimension: a pull-request run — whose diff can
    // influence what the job executes — must never have the token at all. In a
    // workflow whose ONLY trigger is a base-branch push, the trigger is that guard,
    // so the secret is referenced plainly and the guard is structural.
    const workflow = ratchetWorkflow(read(path))
    expect(workflow?.source).toContain('secrets.COVERAGE_RATCHET_TOKEN')
  })

  it.each(GUIDELINES)('%s keeps the PRE-MERGE gate free of any commit-back', path => {
    // The gate decides pass/fail and never persists. A commit-back inside it would
    // also never run (see above) — this keeps the two facts from drifting apart.
    const preMerge = yamlBlocks(read(path)).filter(block => block.source.includes('pull_request:'))
    expect(
      preMerge.length,
      'the pre-merge gate template is gone — repoint this test',
    ).toBeGreaterThan(0)
    for (const block of preMerge) {
      expect(block.source, `${label(path)}: pre-merge gate must not attempt a write`).not.toContain(
        COMMAND,
      )
      expect(block.source).not.toContain(TOKEN)
    }
  })

  it.each(GUIDELINES)('%s says which parts are GitHub-Actions-specific', path => {
    // The edge case this closes: the guideline is provider-agnostic, the step is
    // not. Stating that beats implying a portability the step does not have.
    const text = read(path)
    expect(text).toMatch(/GitHub-Actions-specific/)
    expect(text).toContain('GITHUB_EVENT_NAME')
  })

  it.each(GUIDELINES.concat(EXAMPLES))('%s documents the flags the command really has', path => {
    // Anti-drift, in the direction that hurts: the KB tells an adopter what to put
    // in their pipeline, so every flag it names must exist in the command.
    for (const flag of read(path).match(/--[a-z][a-z-]+/g) ?? []) {
      if (!['--coverage-config', '--measured', '--way-of-working', '--dry-run'].includes(flag)) {
        continue
      }
      expect(
        METADATA,
        `${label(path)} documents ${flag}, the command does not declare it`,
      ).toContain(flag)
    }
  })
})

describe('what replaced it — the credential is the adopter own', () => {
  it.each(EXAMPLES)('%s names the two scopes and refuses a protection bypass', path => {
    const text = read(path)
    expect(text).toContain(TOKEN)
    expect(text).toContain('contents: write')
    expect(text).toContain('pull requests: write')
    expect(text).toMatch(/bypass/i)
  })

  it.each(EXAMPLES)('%s states what happens without it (warn, verdict unchanged)', path => {
    const text = read(path)
    expect(text).toMatch(/naming the missing credential/i)
    expect(text).toMatch(/verdict is unchanged|verdict untouched/i)
  })

  it.each(EXAMPLES)('%s says the credential lives in the adopter repository', path => {
    // The point of the sentence: the scope is guidance pair cannot enforce, not
    // configuration it applies.
    expect(read(path)).toMatch(/yours to provision|lives in your repository/i)
  })
})

describe('setup-gates: the nested question, gated on the parent flag', () => {
  it.each(SETUP_GATES)('%s asks it only when the coverage guardrail is enabled', path => {
    const text = read(path)
    expect(text).toContain('COMMIT_BACK')
    expect(text).toMatch(/only when `COVERAGE_GUARDRAIL = enabled`/)
    expect(text).toMatch(/do \*\*not\*\* ask/)
  })

  it.each(SETUP_GATES)('%s records the flag as a nested declaring bullet', path => {
    const text = read(path)
    expect(text).toContain('Coverage baseline commit-back: enabled')
    expect(text).toMatch(/\*\*nested under\*\* the `Coverage guardrail` bullet/)
    expect(text).toMatch(/declaring bullet/)
  })

  it.each(SETUP_GATES)('%s emits a push-triggered workflow, not a step in the gate', path => {
    // The other half of the guard above: a skill that told the executor to put the
    // step in the pre-merge pipeline would produce an unrunnable step no matter how
    // correct the guideline's own template is.
    const text = read(path)
    expect(text).toMatch(/SEPARATE, push-triggered workflow, never a step in the gate/)
    expect(text).toMatch(/Do not put the commit-back in the pre-merge pipeline/)
    expect(text).toMatch(/SKIPPED \(not-base-push\)/)
  })

  it.each(SETUP_GATES)('%s says nothing contradictory about what is emitted', path => {
    // The bullet said "emitted as a step" and, three sentences later, "a separate
    // workflow, not a step". An executor reading the first clause emits the shape
    // the second forbids — and this file IS the instruction, so an ambiguity here
    // is a defect, not a wording preference.
    const text = read(path)
    expect(text, 'the pre-fix phrasing is back').not.toMatch(/emitted as a step/)
    expect(text).toMatch(/emitted as a separate workflow/)
  })

  it.each(SETUP_GATES)('%s substitutes the measured TYPES, not just the branch', path => {
    const text = read(path)
    expect(text).toMatch(/one `<type>=<pct>` entry per `baseline\.<type>`/)
    expect(text).toMatch(/single hardcoded `default=`/)
  })

  it.each(SETUP_GATES)('%s substitutes the base branch instead of hardcoding one', path => {
    // A pipeline generated for a project whose base branch is `develop` must not
    // carry `main`, and must not ship the placeholder either.
    const text = read(path)
    expect(text).toMatch(/never hardcode `main`/)
    expect(text).toMatch(/no `<placeholder>` survived the substitution/)
  })

  it.each(SETUP_GATES)('%s emits nothing when the flag is off', path => {
    const text = read(path)
    expect(text).toMatch(/emit \*\*nothing\*\*/)
    expect(text).toMatch(/byte-identical/)
  })

  it.each(SETUP_GATES)('%s keeps the default disabled and names the credential', path => {
    const text = read(path)
    expect(text).toContain(TOKEN)
    expect(text).toMatch(/turns it on for nobody/)
  })

  it.each(SETUP_GATES)('%s reports the resolved choice in its output', path => {
    // Including the "not asked" arm: a project with the guardrail off must be able
    // to tell "declined" from "never offered".
    const text = read(path)
    expect(text).toMatch(/Coverage commit-back: \[disabled/)
    expect(text).toContain('not asked')
  })
})
