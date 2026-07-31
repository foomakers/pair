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
  checkTutorialCommands,
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

describe('checkTutorialCommands', () => {
  it('flags an unknown pair-cli command reference', () => {
    expect(checkTutorialCommands(['run pair-cli bogus'], ['install'])).toHaveLength(1)
  })

  it('ignores builtins and prose words after pair-cli', () => {
    expect(
      checkTutorialCommands(['pair-cli --version', 'pair-cli is installed'], ['install']),
    ).toHaveLength(0)
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
  it('reports zero drift and 41 skills against the actual repo', () => {
    const { errors, skillCount } = runAllChecks(REPO_ROOT)
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(skillCount).toBe(41)
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
    expect(rows.size).toBe(41)
    expect(rows.get('next')?.command).toBe('/pair-next')
    for (const [, row] of rows) expect(row.description.length).toBeGreaterThan(0)
  })
  it('the committed skills-catalog rows match the dataset-derived truth (no drift)', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    const errors = checkCatalogContent(rows, readFileSync(CATALOG, 'utf-8'))
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
