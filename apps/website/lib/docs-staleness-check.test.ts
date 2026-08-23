import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import {
  findSkillCountMismatches,
  findPluginSkillCountMismatches,
  countDeclaredPluginSkills,
  findGuideCountMismatches,
  findDeadLinks,
  checkCatalogSync,
  checkCommandAnchors,
  checkDocsCommands,
  countHowToGuides,
  buildValidRoutes,
  runAllChecks,
  deriveSkillCommand,
  extractFirstSentence,
  transformCommandTokens,
  readSkillDescription,
  parseCatalogRow,
  checkCatalogContent,
  generateCatalogRows,
  checkBatchEnginePaths,
  checkBatchEngineAgents,
  checkBatchEngineWorkflows,
  batchEngineErrors,
  checkListTargetsSamples,
} from './docs-staleness-check'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// White-box unit tests for the docs-staleness gate LOGIC. Exported functions are
// tested directly — no spawning of any CLI/script. The thin `tsx` CLI wrapper is
// out of scope here (its logic is these functions); parity with the real docs
// tree is asserted in-process via runAllChecks() below.

const REPO_ROOT = resolve(__dirname, '../../..')

describe('findSkillCountMismatches', () => {
  it('flags a wrong bare "N skills"', () => {
    expect(findSkillCountMismatches('has 5 skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('passes a matching "N skills"', () => {
    expect(findSkillCountMismatches('has 35 skills', 'a.mdx', 35)).toHaveLength(0)
  })

  it('flags a wrong "N composable skills" (adjective between number and skills)', () => {
    const errs = findSkillCountMismatches('7 composable skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 composable skills')
  })

  it('flags a wrong "N+ skills" (trailing plus)', () => {
    expect(findSkillCountMismatches('30+ skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('flags a wrong "N agent skills"', () => {
    const errs = findSkillCountMismatches('exposes 7 agent skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 agent skills')
  })

  it('passes matching "N composable skills" and "N+ skills"', () => {
    expect(findSkillCountMismatches('1 composable skills and 1+ skills', 'a.mdx', 1)).toHaveLength(
      0,
    )
  })

  it('ignores subset counts ("N process skills")', () => {
    expect(findSkillCountMismatches('9 process skills', 'a.mdx', 35)).toHaveLength(0)
  })

  // The two phrasings the marketplace docs introduced, both of which drifted
  // silently (docs said 40 while the dataset held 41) because neither matched.
  it('flags a wrong "N declared pair skills"', () => {
    const errs = findSkillCountMismatches('exactly the 40 declared pair skills', 'a.mdx', 41)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('40 declared pair skills')
  })

  // The `Skills (N)` transcript is NOT a dataset-skill count — check 1 must ignore it,
  // or the two readings fight over one number (the plugin declares 1, the dataset 41).
  it('leaves the `Skills (N)` plugin transcript to the plugin check', () => {
    expect(findSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 41)).toHaveLength(0)
  })
})

describe('findPluginSkillCountMismatches', () => {
  it('flags a `Skills (N)` transcript that disagrees with the manifest', () => {
    const errs = findPluginSkillCountMismatches('reports `Skills (40)`, `Agents (0)`', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Skills (40)')
    expect(errs[0]).toContain('Plugin skill count')
  })

  it('passes a matching transcript', () => {
    expect(findPluginSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 1)).toHaveLength(0)
  })

  it('does not read a sibling `Agents (N)`/`Hooks (N)` count as a skill count', () => {
    expect(
      findPluginSkillCountMismatches('`Agents (0)`, `Hooks (0)`, `MCP servers (0)`', 'a.mdx', 1),
    ).toHaveLength(0)
  })
})

describe('countDeclaredPluginSkills', () => {
  it('reads the real manifest at the plugin root', () => {
    const manifest = join(
      REPO_ROOT,
      'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json',
    )
    expect(countDeclaredPluginSkills(manifest)).toBeGreaterThan(0)
  })

  it('returns null for a missing manifest, so the probe check is skipped not zeroed', () => {
    expect(countDeclaredPluginSkills(join(REPO_ROOT, 'nope/plugin.json'))).toBeNull()
  })
})

describe('findGuideCountMismatches', () => {
  it('flags a wrong "N how-to guides"', () => {
    expect(findGuideCountMismatches('11 how-to guides', 'a.mdx', 9)).toHaveLength(1)
  })

  it('passes a matching "N how-to guides"', () => {
    expect(findGuideCountMismatches('9 how-to guides', 'a.mdx', 9)).toHaveLength(0)
  })

  it('flags wrong counts in adjective phrasings ("N sequential/step-by-step guides")', () => {
    const errs = findGuideCountMismatches(
      '11 sequential guides and 11 step-by-step guides',
      'a.mdx',
      9,
    )
    expect(errs).toHaveLength(2)
    expect(errs[0]).toContain('11 sequential guides')
    expect(errs[1]).toContain('11 step-by-step guides')
  })

  it('flags "N step-by-step process guides" and "N process guides"', () => {
    expect(findGuideCountMismatches('11 step-by-step process guides', 'a.mdx', 9)).toHaveLength(1)
    expect(findGuideCountMismatches('11 process guides', 'a.mdx', 9)).toHaveLength(1)
  })

  it('does NOT false-positive on bare "N guides" prose (no how-to qualifier)', () => {
    expect(
      findGuideCountMismatches('5 guides at the museum and 3 tour guides', 'a.mdx', 9),
    ).toHaveLength(0)
  })
})

describe('countHowToGuides', () => {
  it('returns null when the how-to dir is missing (drives the loud gate failure)', () => {
    expect(countHowToGuides(resolve(REPO_ROOT, 'does/not/exist'))).toBeNull()
  })

  it('counts NN-how-to-*.md files in the real dataset (ignoring README)', () => {
    const n = countHowToGuides(
      resolve(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    )
    expect(n).toBe(9)
  })
})

describe('findDeadLinks', () => {
  const routes = new Set(['/docs', '/docs/reference/skills-catalog', '/docs/tutorials'])

  it('flags a dead markdown link', () => {
    expect(findDeadLinks('see [x](/docs/nope)', 'a.mdx', routes)).toHaveLength(1)
  })

  it('flags a dead JSX href="/docs/..." card link', () => {
    const errs = findDeadLinks('<Card href="/docs/does-not-exist">x</Card>', 'a.mdx', routes)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('/docs/does-not-exist')
  })

  it('passes a valid JSX href and a valid markdown link (incl. anchors)', () => {
    const ok = '<Card href="/docs/reference/skills-catalog">x</Card> and [t](/docs/tutorials#top)'
    expect(findDeadLinks(ok, 'a.mdx', routes)).toHaveLength(0)
  })
})

describe('checkCatalogSync', () => {
  it('flags a skill dir missing from the catalog', () => {
    expect(checkCatalogSync(['implement'], 'no rows here')).toHaveLength(1)
  })

  it('flags a catalog row with no matching dir', () => {
    expect(checkCatalogSync([], '| **ghost** | row |')).toHaveLength(1)
  })

  it('passes when both directions agree', () => {
    expect(checkCatalogSync(['implement'], '| **implement** | row |')).toHaveLength(0)
  })
})

describe('checkCommandAnchors', () => {
  it('flags a command dir with no anchor', () => {
    expect(checkCommandAnchors(['install'], 'no anchors')).toHaveLength(1)
  })

  it('passes when the anchor exists', () => {
    expect(checkCommandAnchors(['install'], '## install (#install)')).toHaveLength(0)
  })
})

describe('checkDocsCommands', () => {
  const commands = ['install', 'update', 'kb-validate']
  const doc = (content: string) => [{ rel: 'a.mdx', content }]

  it('flags a command a doc tells the reader to run that does not exist', () => {
    const errs = checkDocsCommands(doc('Run `pair-cli init` first.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli init')
  })

  it('flags a hyphen-less subcommand (`kb validate`)', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli kb validate\n```'), commands)).toHaveLength(1)
  })

  it('passes a real command in a span and in a fence', () => {
    expect(checkDocsCommands(doc('Run `pair-cli install`.'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\nnpx --no pair-cli update\n```'), commands)).toHaveLength(
      0,
    )
  })

  // The reason the rule is positional rather than a prose-word allow-list: these are
  // English, and an earlier list-based version had to grow a word for each of them.
  it('ignores "pair-cli" used as a noun in prose', () => {
    const prose = 'Common pair-cli workflows, and the pair-cli version it invokes.'
    expect(checkDocsCommands(doc(prose), commands)).toHaveLength(0)
  })

  it('ignores a version string printed as OUTPUT in a fence', () => {
    expect(checkDocsCommands(doc('```text\npair-cli vX.Y.Z\n```'), commands)).toHaveLength(0)
  })

  it('ignores a flag, which is never a command name', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli --version\n```'), commands)).toHaveLength(0)
  })
})

describe('buildValidRoutes', () => {
  it('maps index.mdx to /docs and folder index to the folder route', () => {
    const docsDir = '/x/docs'
    const routes = buildValidRoutes(
      ['/x/docs/index.mdx', '/x/docs/reference/index.mdx', '/x/docs/tutorials/first.mdx'],
      docsDir,
    )
    expect(routes.has('/docs')).toBe(true)
    expect(routes.has('/docs/reference')).toBe(true)
    expect(routes.has('/docs/tutorials/first')).toBe(true)
  })
})

describe('runAllChecks (in-process, real docs tree)', () => {
  it('reports zero drift and 42 skills against the actual repo', () => {
    const { errors, skillCount } = runAllChecks(REPO_ROOT)
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(skillCount).toBe(43)
  })
})

// Check 2c — catalog ROW CONTENT single-sourced from the dataset SKILL.md frontmatter.
describe('deriveSkillCommand', () => {
  it('non-meta skill → /pair-<category>-<name>', () => {
    expect(deriveSkillCommand('process', 'review')).toBe('/pair-process-review')
    expect(deriveSkillCommand('capability', 'classify')).toBe('/pair-capability-classify')
  })
  it('meta skill (name === category) → /pair-<name>', () => {
    expect(deriveSkillCommand('next', 'next')).toBe('/pair-next')
  })
})

describe('readSkillDescription', () => {
  it('extracts the quoted description scalar from frontmatter', () => {
    expect(readSkillDescription('---\nname: x\ndescription: "Hello world."\n---\n# x\n')).toBe(
      'Hello world.',
    )
  })
  it('returns empty string when absent', () => {
    expect(readSkillDescription('---\nname: x\n---\n')).toBe('')
  })
})

describe('extractFirstSentence', () => {
  it('cuts at the first sentence-terminating period', () => {
    expect(extractFirstSentence('First sentence. Second one.')).toBe('First sentence.')
  })
  it('does not cut on known abbreviations (e.g.)', () => {
    expect(extractFirstSentence('Uses e.g. this and that. Next.')).toBe('Uses e.g. this and that.')
  })
  it('cuts before a $scope/$mode enumeration and ensures a closing period', () => {
    expect(extractFirstSentence('Does a thing: `$scope: full` here.')).toBe('Does a thing.')
  })
})

describe('transformCommandTokens', () => {
  const cmds = new Map([['classify', '/pair-capability-classify']])
  it('backticks + qualifies a bare /command at a word boundary', () => {
    expect(transformCommandTokens('Composes /classify here.', cmds)).toBe(
      'Composes `/pair-capability-classify` here.',
    )
  })
  it('leaves slash-joined prose (map-a/map-b) intact', () => {
    expect(transformCommandTokens('see map-a/map-b flow', cmds)).toBe('see map-a/map-b flow')
  })
})

describe('parseCatalogRow', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('parses the command + description cells of a row', () => {
    expect(parseCatalogRow(catalog, 'classify')).toEqual({
      command: '/pair-capability-classify',
      description: 'Applies the model.',
    })
  })
  it('returns null when the skill has no row', () => {
    expect(parseCatalogRow(catalog, 'ghost')).toBeNull()
  })
})

describe('checkCatalogContent (Check 2c)', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('passes when the row matches the generated truth', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Applies the model.' }],
    ])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
  it('flags command drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify-X', description: 'Applies the model.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('command drift') && e.includes('classify'))).toBe(true)
  })
  it('flags description drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Something else.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('description drift') && e.includes('classify'))).toBe(true)
  })
  it('skips a skill with no catalog row (checkCatalogSync owns presence)', () => {
    const expected = new Map([['ghost', { command: '/pair-ghost', description: 'X.' }]])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
})

describe('generateCatalogRows + committed catalog parity (Check 2c integration)', () => {
  const SKILLS_DIR = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
  const CATALOG = join(REPO_ROOT, 'apps/website/content/docs/reference/skills-catalog.mdx')
  it('derives a command + non-empty description for every dataset skill', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    expect(rows.size).toBe(43)
    expect(rows.get('next')?.command).toBe('/pair-next')
    for (const [, row] of rows) expect(row.description.length).toBeGreaterThan(0)
  })
  it('the committed skills-catalog rows match the dataset-derived truth (no drift)', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    const errors = checkCatalogContent(rows, readFileSync(CATALOG, 'utf-8'))
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

// ── The batch-engine page's claims (#219, review of #432) ─────────────────────
// Both gates were shipped without a unit test, so their failure branches had never been
// executed — including the one for a DELETED registry, which cannot be reached from the real
// config at all. The repo's own convention (ADL 2026-07-13) is that gate logic lives in tested
// production modules, and every sibling check in this file has tests.
describe('checkBatchEnginePaths', () => {
  const doc = 'installs into `.claude/workflows/` and `.claude/agents/`'
  const registries = {
    workflows: { targets: [{ path: '.claude/workflows/' }] },
    'agent-definitions': { targets: [{ path: '.claude/agents/' }] },
  }

  it('passes when the page names every install target', () => {
    expect(checkBatchEnginePaths(registries, doc)).toEqual([])
  })

  it('fails when a registry target is RENAMED and the page still names the old one', () => {
    const renamed = { ...registries, workflows: { targets: [{ path: '.claude/flows/' }] } }
    expect(checkBatchEnginePaths(renamed, doc)).toEqual([
      'batch-engine.mdx does not mention ".claude/flows/", where the "workflows" registry installs',
    ])
  })

  it('fails when a registry is REMOVED entirely but the page still documents it', () => {
    // Unreachable from the real config, which is exactly why it needs a test: this branch had
    // never run, so a doc describing an install that no longer happens would have passed.
    const rest = Object.fromEntries(
      Object.entries(registries).filter(([name]) => name !== 'workflows'),
    )
    expect(checkBatchEnginePaths(rest, doc)).toEqual([
      'asset_registries."workflows" is gone but batch-engine.mdx still documents it',
    ])
  })
})

describe('checkBatchEngineAgents', () => {
  const agents = [
    { name: 'pair-implementer', tools: 'Read, Edit, Write, Bash' },
    { name: 'pair-reviewer', tools: 'Read, Grep, Bash' },
  ]
  const doc =
    '`pair-implementer` holds `Read, Edit, Write, Bash`; `pair-reviewer` holds `Read, Grep, Bash`'

  it('passes when every agent is named with its exact declared tools', () => {
    expect(checkBatchEngineAgents(agents, doc)).toEqual([])
  })

  it('fails when an agent is not enumerated at all', () => {
    const withThird = [...agents, { name: 'pair-contract-generator', tools: 'Read, Write, Bash' }]
    expect(checkBatchEngineAgents(withThird, doc)).toEqual([
      'batch-engine.mdx does not name the shipped agent "pair-contract-generator"',
    ])
  })

  it('fails when an agent is named but its tool list is understated', () => {
    // The measured case: the page said `pair-reviewer` holds `Bash` while its frontmatter
    // declared five tools, so the note understated the authority an adopter installs.
    const widened = [{ name: 'pair-reviewer', tools: 'Read, Grep, Glob, Bash, Skill' }]
    expect(checkBatchEngineAgents(widened, doc)).toEqual([
      'batch-engine.mdx does not state "pair-reviewer" tools as declared in its frontmatter: "Read, Grep, Glob, Bash, Skill"',
    ])
  })

  it('reports an empty agent set rather than passing vacuously', () => {
    // Deleting the dataset agents directory would otherwise turn the check green.
    expect(checkBatchEngineAgents([], doc)).toEqual([
      'no agent definitions found in the dataset — the batch-engine agent check is vacuous',
    ])
  })
})

// The AGENT table is derived; the WORKFLOW table beside it was not, so a third shipped
// workflow — or a renamed one — left the page silently describing a set that no longer exists.
// Same shape as the agent check, same reason: what installs is a fact, and a fact on this page
// is read from the dataset rather than hand-copied.
describe('checkBatchEngineWorkflows', () => {
  const doc =
    '| Workflow | What it drives |\n| --- | --- |\n| `pair-implement-batch` | … |\n| `pair-refine-batch` | … |\n\nprose about `pair-implementer` and `pair-reviewer`.'

  it('passes when the page names every shipped workflow', () => {
    expect(checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], doc)).toEqual(
      [],
    )
  })

  it('fails when a shipped workflow is missing from the table', () => {
    expect(
      checkBatchEngineWorkflows(
        ['pair-implement-batch', 'pair-refine-batch', 'pair-triage-batch'],
        doc,
      ),
    ).toEqual(['batch-engine.mdx does not name the shipped workflow "pair-triage-batch"'])
  })

  it('fails when the page names a workflow that no longer ships', () => {
    // The reverse direction matters as much: a page promising a workflow the adopter never
    // receives is the same defect pointed the other way.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], doc)).toEqual([
      'batch-engine.mdx names "pair-refine-batch", which the workflows registry does not ship',
    ])
  })

  // The reverse direction matched `` `pair-*-batch` `` only, so it could catch a stale name
  // exactly when that name kept the `-batch` suffix. A workflow renamed or retired WITHOUT it
  // — `pair-triage`, the shape a future non-batch workflow takes — stayed on the page promising
  // an install nobody gets, which is the very failure the reverse check exists for. Reading the
  // table's own rows answers it for any name, and keeps the agent table's `pair-*` names (which
  // this check does not own) out of the scan.
  it('fails when the page names a retired workflow whose name has no `-batch` suffix', () => {
    const withTriage = `${doc}\n`.replace(
      '| `pair-refine-batch` | … |',
      '| `pair-refine-batch` | … |\n| `pair-triage` | … |',
    )
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withTriage),
    ).toEqual(['batch-engine.mdx names "pair-triage", which the workflows registry does not ship'])
  })

  it('does not read the AGENT table or prose as workflow names', () => {
    const withAgents = `${doc}\n\n| Agent | Tools |\n| --- | --- |\n| \`pair-implementer\` | … |\n| \`pair-reviewer\` | … |`
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withAgents),
    ).toEqual([])
  })

  it('reports an empty workflow set rather than passing vacuously', () => {
    expect(checkBatchEngineWorkflows([], doc)).toEqual([
      'no shipped workflows found in the dataset — the batch-engine workflow check is vacuous',
    ])
  })

  it('reports a missing workflow TABLE rather than passing its reverse check vacuously', () => {
    // Same loud-on-absence rule the sibling checks follow: with no table to read, the reverse
    // direction proves nothing and must say so instead of returning green.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], 'no table here')).toEqual([
      'batch-engine.mdx does not name the shipped workflow "pair-implement-batch"',
      'batch-engine.mdx has no workflow table — the reverse check (a name the registry does not ship) cannot run',
    ])
  })
})

// The page's own gate must not be disabled by deleting the page. `batchEngineErrors` returned
// `[]` when the file was absent, so removing `batch-engine.mdx` turned every check above green
// — and AC8 requires the note to EXIST. The same file states the loud-on-absence convention
// twice for other checks; this one contradicted it.
describe('batchEngineErrors on a missing page', () => {
  it('fails loudly instead of self-disabling when the page is gone', () => {
    const errors = batchEngineErrors({
      BATCH_ENGINE_FILE: '/nowhere/batch-engine.mdx',
      CLI_CONFIG: '/nowhere/config.json',
      AGENTS_DIR: '/nowhere/.agents',
      WORKFLOWS_DIR: '/nowhere/.workflows',
    })
    expect(errors).toEqual([
      'Batch engine page not found: /nowhere/batch-engine.mdx — the batch-engine checks cannot run',
    ])
  })
})

describe('checkListTargetsSamples', () => {
  // The shipped shape, trimmed to two registries.
  const registries = {
    github: { behavior: 'mirror', targets: [{ path: '.github' }] },
    knowledge: { behavior: 'mirror', targets: [{ path: '.pair/knowledge' }] },
  }

  // What `listTargets` really prints (handler.ts), uncoloured.
  const real = [
    '  Asset Registries',
    '',
    '  github',
    '    target:   .github',
    '    behavior: mirror',
    '    GitHub workflows and configuration files',
    '',
    '  knowledge',
    '    target:   .pair/knowledge',
    '    behavior: mirror',
    '    Knowledge base and documentation',
  ].join('\n')

  // What the three pages carried before #216 — a columnar table under an invented
  // header, with `.pair` where the registry installs `.pair/knowledge`.
  const invented = [
    'Available asset registries:',
    '  github     .github         GitHub workflows and configuration files',
    '  knowledge  .pair            Knowledge base and documentation',
  ].join('\n')

  it('passes a sample that reproduces the renderer output', () => {
    expect(checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: real }])).toEqual([])
  })

  it('flags the invented columnar transcript on every count', () => {
    const errors = checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: invented }])
    expect(errors).toHaveLength(4) // missing header + invented header + 2 registries
    expect(errors.some(e => e.includes('Available asset registries:'))).toBe(true)
    expect(errors.some(e => e.includes('"knowledge" registry'))).toBe(true)
  })

  it('flags a registry the sample omits', () => {
    const withExtra = {
      ...registries,
      adoption: { behavior: 'add', targets: [{ path: '.pair/adoption' }] },
    }
    const errors = checkListTargetsSamples(withExtra, [{ rel: 'a.mdx', content: real }])
    expect(errors).toEqual([
      'a.mdx: --list-targets sample does not print the "adoption" registry as the CLI does ' +
        '(expected "  adoption" / "    target:   .pair/adoption" / "    behavior: add")',
    ])
  })

  it('flags a RE-TARGETED registry the sample still shows at the old path', () => {
    const moved = {
      ...registries,
      knowledge: { behavior: 'mirror', targets: [{ path: '.pair/kb' }] },
    }
    const errors = checkListTargetsSamples(moved, [{ rel: 'a.mdx', content: real }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('    target:   .pair/kb')
  })

  it('flags a behavior change the sample does not follow', () => {
    const rebehaved = { ...registries, github: { behavior: 'add', targets: [{ path: '.github' }] } }
    expect(checkListTargetsSamples(rebehaved, [{ rel: 'a.mdx', content: real }])).toHaveLength(1)
  })
})
