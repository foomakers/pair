import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

// US-521 T-9 — ONE vocabulary across the consumers of the autonomy model: the same argument names and the
// same precedence sentence in `/pair-next`, `/pair-workflow-cycle`, `pair-cli run` (metadata) and the KB
// guideline. The consumer list is DATA: US-524 added the batch, the loop workflow and the `/pair-loop` skill as rows.

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')
const POLICY_SCRIPT = join(DATASET, '.skills/workflow/cycle/scripts/autonomy-policy.mjs')
const read = (path: string) => readFileSync(path, 'utf-8')

interface Consumer {
  readonly name: string
  readonly file: string
  /** The names this consumer must declare, each spelled the way THAT consumer spells an argument. */
  readonly names: readonly string[]
}

const CONSUMERS: readonly Consumer[] = [
  {
    name: '/pair-next',
    file: join(DATASET, '.skills/next/SKILL.md'),
    names: ['`--root`', '`--filter`', '`--assignee`', '`--status`'],
  },
  {
    name: '/pair-workflow-cycle',
    file: join(DATASET, '.skills/workflow/cycle/SKILL.md'),
    names: ['`$until`', '`$prepare`', '`$merge`'],
  },
  {
    name: 'pair-cli run (metadata)',
    file: join(REPO_ROOT, 'apps/pair-cli/src/commands/run/metadata.ts'),
    names: [
      '--filter <tag>',
      '--assignee <login|@me>',
      '--status <macrostates>',
      '--until <ready|pr|merged>',
      '--prepare <gate>',
      '--merge <gate>',
      '--root <id>',
    ],
  },
  {
    name: 'pair-implement-batch (workflow)',
    file: join(DATASET, '.workflows/pair-implement-batch.js'),
    names: ['`until`', '`prepare`', '`merge`'],
  },
  {
    name: 'pair-loop (workflow)',
    file: join(DATASET, '.workflows/pair-loop.js'),
    names: ['"until"', '"prepare"', '"merge"', '"filter"', '"assignee"', '"status"'],
  },
  {
    name: '/pair-loop',
    file: join(DATASET, '.skills/loop/SKILL.md'),
    names: [
      '`--until`',
      '`--prepare`',
      '`--merge`',
      '`--filter`',
      '`--assignee`',
      '`--status`',
      '`--root`',
    ],
  },
  {
    name: 'KB automation-policy guideline',
    file: join(DATASET, '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'),
    names: ['`filter`', '`assignee`', '`status`', '`root`', '`until`', '`prepare`', '`merge`'],
  },
]

async function script(): Promise<{
  PRECEDENCE_SENTENCE: string
  KEYS: string[]
  parse: (text: string) => { autonomy: Record<string, unknown>; errors: unknown[] }
}> {
  return import(pathToFileURL(POLICY_SCRIPT).href)
}

describe('US-521 T-9: one vocabulary across the autonomy consumers', () => {
  it.each(CONSUMERS)('$name declares its argument names', ({ file, names }) => {
    const text = read(file)
    for (const name of names) expect(text, name).toContain(name)
  })

  it('every consumer states the SAME precedence sentence, owned by the shared script', async () => {
    const { PRECEDENCE_SENTENCE } = await script()
    expect(PRECEDENCE_SENTENCE).toMatch(
      /argument > adoption .* > KB default .* printed with its source/,
    )
    for (const { name, file } of CONSUMERS) expect(read(file), name).toContain(PRECEDENCE_SENTENCE)
  })

  it('the script’s key list is exactly the seven names the KB documents', async () => {
    const { KEYS } = await script()
    expect(KEYS).toEqual(['filter', 'assignee', 'status', 'root', 'until', 'prepare', 'merge'])
  })

  it('the mirror of each consumer carries the same names (source and installed copy agree)', () => {
    for (const rel of [
      '.claude/skills/pair-next/SKILL.md',
      '.claude/skills/pair-workflow-cycle/SKILL.md',
      '.claude/skills/pair-loop/SKILL.md',
      '.claude/workflows/pair-implement-batch.js',
      '.claude/workflows/pair-loop.js',
    ]) {
      const text = read(join(REPO_ROOT, rel))
      expect(text, rel).toContain('Precedence: argument > adoption')
    }
  })
})

describe('US-524: batch and loop honour the model — the A1 refusal is gone', () => {
  const files = [
    join(DATASET, '.workflows/pair-implement-batch.js'),
    join(DATASET, '.workflows/pair-loop.js'),
    join(DATASET, '.skills/loop/SKILL.md'),
  ]
  it('no consumer still refuses with the #524 pointer', () => {
    for (const file of files) expect(read(file), file).not.toContain('autonomy-not-supported')
  })
  it('the batch description no longer says it NEVER merges; it states the merge gate and the sequential fallback', () => {
    const text = read(files[0]!)
    expect(text).not.toMatch(/Stops at PR-ready; NEVER merges/)
    expect(text).toContain('a card merges ONLY when the merge gate allows it')
    expect(text).toContain('/pair-workflow-cycle one card at a time with the same arguments')
  })
  it('/pair-loop states the degraded path as the cycle one card at a time and owns no merge', () => {
    const text = read(files[2]!)
    expect(text).toContain('`/pair-workflow-cycle --card <id>`')
    expect(text).toContain('**Never merges.**')
  })
  it('pair-loop.js carries no cycle-merge call (merge authority has one owner: the batch)', () => {
    expect(
      read(files[1]!)
        .split('\n')
        .filter(l => !/^\s*\/\//.test(l))
        .join('\n'),
    ).not.toContain('cycle-merge')
  })
})

describe('US-521 T-3: the KB examples are parsed by the shared script', () => {
  it('the ```autonomy example in the guideline parses clean, with every key', async () => {
    const { parse, KEYS } = await script()
    const doc = read(
      join(DATASET, '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'),
    )
    const block = /```autonomy\n([\s\S]*?)```/.exec(doc)?.[1]
    expect(block).toBeDefined()
    const parsed = parse(`## Autonomy\n\n${block}`)
    expect(parsed.errors).toEqual([])
    expect(Object.keys(parsed.autonomy).sort()).toEqual([...KEYS].sort())
  })

  it('the legacy translation table in the guideline matches what the script translates', async () => {
    const { parse } = await script()
    const doc = read(
      join(DATASET, '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'),
    )
    expect(doc).toContain('| `## Eligibility` `<label>` | `filter: <label>` |')
    expect(doc).toContain('| `## Auto-Advance` `(none)` | `merge: always` |')
    expect(doc).toContain('`merge: when; lacks: <tier>`')
    const t = parse(
      '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n',
    ) as unknown as {
      translated: Record<string, { value: unknown }>
    }
    expect(t.translated['filter']?.value).toEqual(['risk:green'])
    expect(t.translated['merge']?.value).toEqual({ mode: 'when', has: [], lacks: ['risk:green'] })
  })

  it('`## Eligibility` keeps its one-literal-label rule while the new fields take lists', async () => {
    const { parse } = await script()
    expect(parse('## Eligibility\n\na:b, c:d\n').errors).not.toEqual([])
    expect(parse('## Autonomy\n\nfilter: a:b, c:d\n').errors).toEqual([])
  })

  it('both mirrors of the guideline carry the Autonomy section', () => {
    const rel = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
    for (const path of [join(DATASET, rel), join(REPO_ROOT, rel)])
      expect(read(path)).toContain('## Autonomy — selection, target and gates')
  })
})
