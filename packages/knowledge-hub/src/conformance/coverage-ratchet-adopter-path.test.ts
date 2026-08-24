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

  it.each(GUIDELINES)('%s binds the credential to a base-branch push only', path => {
    // Least privilege in the EVENT dimension: a pull-request run — whose diff can
    // influence what the job executes — must never have the token at all.
    expect(read(path)).toMatch(
      /COVERAGE_RATCHET_TOKEN: \$\{\{ \(github\.event_name == 'push' && github\.ref_name == 'main'\)/,
    )
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
