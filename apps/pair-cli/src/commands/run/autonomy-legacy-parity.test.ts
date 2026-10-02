import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH, readAutomationPolicy } from './automation-policy'
import type { DriveCycleResult } from './run-context'

/**
 * US-521 remediation r2-g1, finding r1-1 — the shared resolver (`autonomy-policy.mjs`) translates a legacy
 * `## Eligibility` with the LEGACY section's own grammar, not with the stricter `## Autonomy` label rule.
 * Since r1-g1 the resolver runs at the entry of EVERY `pair-cli run`, so a stricter translation HALTs a
 * project that declares nothing new (AC-8 "every existing HALT and nothing new", AC-11 default off).
 *
 * The parity table is DERIVED, never restated: every case is first read by the real `readAutomationPolicy`
 * (the legacy grammar: the guideline's seven HALT triggers + the prompt-safety content MUST), and the
 * resolver must give the same verdict — accept with the label verbatim, or reject with the same message
 * class. `## Autonomy` keys (new) keep the strict check. Every `pair-cli run` entry accepts what the legacy
 * reader accepts exactly as it did before the resolver existed (differential: script installed vs not).
 *
 * Hermetic: real scripts from the dataset, in-memory project rooted at a real temp dir, PATH = only `node`.
 */

const SCRIPT_SRC = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/autonomy-policy.mjs',
)
interface Resolution {
  ok: boolean
  effective: Record<string, { value?: unknown; source: string }>
  errors: Array<{ key: string; reason: string }>
}
interface PolicyScript {
  resolvePolicy: (input: { args?: Record<string, string>; adoptionText?: string }) => Resolution
}
const script = async (): Promise<PolicyScript> =>
  (await import(pathToFileURL(SCRIPT_SRC).href)) as PolicyScript

/** The message class: the trigger a message reports, whichever reader worded it. Order matters. */
function messageClass(message: string): string {
  if (/exactly one declaration/.test(message)) return 'duplicate-heading'
  if (/present but empty|\bis empty\b/.test(message)) return 'empty'
  if (/juxtapos/.test(message)) return 'juxtaposed'
  if (/markdown wrapper/.test(message)) return 'wrapper'
  if (/label cap/.test(message)) return 'cap'
  if (/command fragment/.test(message)) return 'unsafe'
  if (/exactly one label|boolean operator/.test(message)) return 'one-label'
  return `unclassified: ${message}`
}

type Verdict = { accepted: true; label: string | undefined } | { accepted: false; cls: string }

function legacyVerdict(policyText: string): Verdict {
  const fs = new InMemoryFileSystemService({ [`/p/${POLICY_PATH}`]: policyText }, '/p', '/p')
  try {
    return { accepted: true, label: readAutomationPolicy(fs, '/p').eligibility }
  } catch (error) {
    return { accepted: false, cls: messageClass((error as Error).message) }
  }
}
async function resolverVerdict(policyText: string): Promise<Verdict> {
  const r = (await script()).resolvePolicy({ adoptionText: policyText })
  if (!r.ok) return { accepted: false, cls: messageClass(r.errors[0]?.reason ?? '') }
  const filter = r.effective['filter']?.value
  return { accepted: true, label: Array.isArray(filter) ? filter.join(',') : undefined }
}

const ELIG = (label: string) => `## Eligibility\n\n${label}\n\n## Auto-Advance\n\n(none)\n`

/**
 * One label per rule of the legacy grammar and per boundary of it — the reviewer's `don't-merge`, every
 * character the strict rule refuses and the legacy one allows, each HALT trigger, and the order-sensitive
 * pairs where two triggers fire at once. The EXPECTED verdict is whatever `readAutomationPolicy` says.
 */
const CORPUS: ReadonlyArray<readonly [string, string]> = [
  ['P-01', "don't-merge"],
  ['P-02', 'Q&A'],
  ['P-03', 'a;b'],
  ['P-04', 'a|b'],
  ['P-05', 'say "hi"'],
  ['P-06', 'back\\slash'],
  ['P-07', 'a>b'],
  ['P-08', 'a<b'],
  ['P-09', '<lt-first'],
  ['P-10', 'good first issue'],
  ['P-11', 'area: backend'],
  ['P-12', 'area:OR-tools'],
  ['P-13', 'risk:green'],
  ['P-14', 'x'.repeat(50)],
  ['P-15', 'price-5$'],
  ['P-16', 'ORDER'],
  ['R-01', 'risk:green, risk:yellow'],
  ['R-02', 'risk:green AND risk:yellow'],
  ['R-03', 'NOT'],
  ['R-04', '`risk:green`'],
  ['R-05', '- risk:green'],
  ['R-06', '#tech-debt'],
  ['R-07', '>quote'],
  ['R-08', '+plus'],
  ['R-09', '*star'],
  ['R-10', 'x'.repeat(51)],
  ['R-11', 'risk:green risk:yellow'],
  ['R-12', 'a$(id)b'],
  ['R-13', 'bell\u0007char'],
  ['R-14', '`a,b`'],
  ['R-15', "#don't"],
  ['R-16', 'risk:green OR x'],
  ['R-17', 'a`b'],
]
const STRUCTURAL: ReadonlyArray<readonly [string, string]> = [
  ['S-01 empty section', '## Eligibility\n\n## Auto-Advance\n\n(none)\n'],
  ['S-02 two lines', '## Eligibility\n\nrisk:green\nrisk:yellow\n'],
  ['S-03 two headings', '## Eligibility\n\nrisk:green\n\n## Eligibility\n\nrisk:green\n'],
  ['S-04 absent section', '## Auto-Advance\n\n(none)\n'],
  ['S-05 legacy tier pair', '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'],
]

describe('r1-1 — the resolver translates `## Eligibility` with the legacy grammar (derived parity table)', () => {
  it.each(CORPUS)('%s: `%s` — same verdict as readAutomationPolicy', async (_, label) => {
    const legacy = legacyVerdict(ELIG(label))
    const resolver = await resolverVerdict(ELIG(label))
    expect(resolver).toEqual(legacy)
  })

  it.each(STRUCTURAL)('%s — same verdict as readAutomationPolicy', async (_, text) => {
    expect(await resolverVerdict(text)).toEqual(legacyVerdict(text))
  })

  it('P-00: the corpus exercises both outcomes of the legacy grammar (the table is not one-sided)', () => {
    const verdicts = CORPUS.map(([, label]) => legacyVerdict(ELIG(label)))
    expect(verdicts.filter(v => v.accepted).length).toBeGreaterThanOrEqual(10)
    const classes = new Set(verdicts.flatMap(v => (v.accepted ? [] : [v.cls])))
    for (const cls of ['one-label', 'wrapper', 'cap', 'juxtaposed', 'unsafe'])
      expect(classes).toContain(cls)
    // Every operator token of trigger 3 standalone, and the content MUST's backtick NOT shadowed by the
    // wrapper trigger (a mid-label backtick) — a port that drops either rule fails a row.
    const rejected = (pred: (label: string) => boolean, cls: string) =>
      CORPUS.some(([, label]) => {
        const v = legacyVerdict(ELIG(label))
        return pred(label) && !v.accepted && v.cls === cls
      })
    for (const op of ['AND', 'OR', 'NOT'])
      expect(
        rejected(l => new RegExp(`(^|\\s)${op}(\\s|$)`).test(l), 'one-label'),
        op,
      ).toBe(true)
    expect(rejected(l => l.includes('`') && !l.startsWith('`'), 'unsafe')).toBe(true)
    expect(rejected(l => l.includes('$('), 'unsafe')).toBe(true)
  })

  it('P-ID: the shared script ships byte-identical in all twelve copies (six dataset skills, six installed)', () => {
    const repo = join(__dirname, '../../../../..')
    const skills = [
      'cycle',
      'green-fix',
      'implement-phase',
      'red-spec',
      'red-verify',
      'review-phase',
    ]
    const canonical = readFileSync(SCRIPT_SRC, 'utf8')
    for (const s of skills) {
      for (const copy of [
        join(
          repo,
          `packages/knowledge-hub/dataset/.skills/workflow/${s}/scripts/autonomy-policy.mjs`,
        ),
        join(repo, `.claude/skills/pair-workflow-${s}/scripts/autonomy-policy.mjs`),
      ])
        expect(readFileSync(copy, 'utf8'), copy).toBe(canonical)
    }
  })
})

describe('r1-1 — `## Autonomy` keys (new) keep the strict label rule', () => {
  it.each(["don't-merge", 'Q&A', 'a;b', 'a|b', 'say "hi"'])(
    'N-01: `## Autonomy filter: %s` is refused naming `filter`',
    async label => {
      const r = (await script()).resolvePolicy({
        adoptionText: `## Autonomy\n\nfilter: ${label}\n`,
      })
      expect(r.ok).toBe(false)
      expect(r.errors.map(e => e.key)).toContain('filter')
    },
  )

  it('N-02: a gate list element `Q&A` (`merge: when; has: Q&A`) is refused naming `merge has`', async () => {
    const r = (await script()).resolvePolicy({
      adoptionText: '## Autonomy\n\nmerge: when; has: Q&A\n',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map(e => e.key)).toContain('merge has')
  })

  it('N-03: `## Autonomy filter: Q&A` beside a legacy `## Eligibility Q&A` is still refused (the legacy grammar never widens a new key)', async () => {
    const r = (await script()).resolvePolicy({
      adoptionText: '## Eligibility\n\nQ&A\n\n## Autonomy\n\nfilter: Q&A\n',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map(e => e.key)).toContain('filter')
  })
})

// ── every pair-cli run entry: accepted exactly as before the resolver existed ─────────────────
const SCRIPT_REL = '.claude/skills/pair-workflow-cycle/scripts'
let root: string
let bin: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'autonomy-legacy-parity-')))
  mkdirSync(join(root, SCRIPT_REL), { recursive: true })
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  bin = join(root, 'bin')
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', bin)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

/** `installed`: the shared script on disk (today); not installed ⇒ the pre-#521 legacy path, byte for byte. */
function project(policy: string, installed: boolean) {
  writeFileSync(join(root, POLICY_PATH), policy)
  if (installed) copyFileSync(SCRIPT_SRC, join(root, SCRIPT_REL, 'autonomy-policy.mjs'))
  else rmSync(join(root, SCRIPT_REL, 'autonomy-policy.mjs'), { force: true })
  return new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }),
      [`${root}/.claude/skills/pair-next/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${root}/${SCRIPT_REL}/cycle-state.mjs`]: '',
      [`${root}/${SCRIPT_REL}/cycle-dispatch.mjs`]: '',
      [`${root}/${SCRIPT_REL}/autonomy-policy.mjs`]: '',
      [`${bin}/claude`]: '',
      [`${root}/${POLICY_PATH}`]: policy,
    },
    root,
    root,
  )
}

interface Outcome {
  code: number | string
  prompts: string[]
}
async function runEntry(
  flags: Record<string, string | boolean>,
  policy: string,
  installed: boolean,
): Promise<Outcome> {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const prompts: string[] = []
  const runIteration: IterationRunner = async input => {
    prompts.push(input.promptText)
    return { outcome: 'success', detail: 'done' }
  }
  const deps: RunHandlerDependencies = {
    runIteration,
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/l/${card}`, release: () => {} },
    }),
    appendAudit: () => {},
    cardReadiness: async () => 'draft',
    driveCycle: async (): Promise<DriveCycleResult> => ({
      status: 'ready-for-merge',
      stagesRun: 0,
    }),
  }
  try {
    const code = await handleRunCommand(parseRunCommand(flags), project(policy, installed), deps)
    return { code, prompts }
  } catch (error) {
    return { code: `threw: ${(error as Error).message}`, prompts }
  } finally {
    vi.restoreAllMocks()
  }
}

const ENTRIES: ReadonlyArray<readonly [string, Record<string, string | boolean>]> = [
  ['E-1 --skill pair-next (borrowed eligibility)', { skill: 'pair-next', maxIterations: '1' }],
  ['E-2 --root (default cascade, pair-loop)', { root: '1', maxIterations: '1' }],
  ['E-3 --card Draft (DoR fallback ⇒ refine-story)', { card: '521', cardTags: '' }],
  ['E-4 --card --dry-run', { card: '521', cardTags: '', dryRun: true }],
]
const ACCEPTED_LABELS = ["don't-merge", 'Q&A', 'a;b', 'say "hi"', 'back\\slash', 'a>b']

describe('r1-1 — every pair-cli run entry: a legacy-accepted label runs exactly as before the resolver', () => {
  for (const [entry, flags] of ENTRIES)
    it.each(ACCEPTED_LABELS)(
      `${entry}: \`## Eligibility %s\` — same outcome and prompts as the legacy path`,
      async label => {
        const before = await runEntry(flags, ELIG(label), false)
        expect(before.code).toBe(0)
        const now = await runEntry(flags, ELIG(label), true)
        expect(now).toEqual(before)
      },
    )

  it('E-5: the reviewer’s fixture (`## Eligibility don’t-merge`, `## Auto-Advance (none)`) on --skill pair-next does not HALT', async () => {
    const out = await runEntry(
      { skill: 'pair-next', maxIterations: '1' },
      "## Eligibility\n\ndon't-merge\n\n## Auto-Advance\n\n(none)\n",
      true,
    )
    expect(out.code).toBe(0)
    expect(out.prompts).toHaveLength(1)
  })

  it.each(['risk:green, risk:yellow', '#tech-debt', 'risk:green risk:yellow'])(
    'E-6: a legacy-REJECTED `## Eligibility %s` still HALTs every entry with the legacy message',
    async label => {
      for (const [, flags] of ENTRIES) {
        const before = await runEntry(flags, ELIG(label), false)
        const now = await runEntry(flags, ELIG(label), true)
        expect(String(before.code)).toMatch(/^threw: /)
        expect(messageClass(String(now.code))).toBe(messageClass(String(before.code)))
      }
    },
  )
})
