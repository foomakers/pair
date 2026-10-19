/**
 * Docs information architecture (#552, increment 6): the structural promises of the IA review
 * (process-lifecycle spine, three-label pair pattern, recipe-only guides, no Customization
 * section, glossary, reconciled vocabulary, captions that say what to notice, redirects that
 * land). Each `describe` maps to one acceptance criterion (AC53..AC60).
 *
 * Content-level (every page exists, every link resolves, CP5 and the e2e page list equal the
 * filesystem) is owned by `docs-staleness-check.ts` and
 * `packages/knowledge-hub/src/conformance/docs-page-coverage.test.ts`; nothing here repeats it.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WEBSITE = join(__dirname, '..')
const DOCS = join(WEBSITE, 'content', 'docs')

const read = (rel: string): string => readFileSync(join(DOCS, rel), 'utf-8')
const exists = (rel: string): boolean => existsSync(join(DOCS, rel))
const meta = (rel: string): string[] => JSON.parse(read(rel)).pages as string[]
const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

const allPages = (): string[] =>
  readdirSync(DOCS, { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace(/\\/g, '/'))
    .sort()

const pagesUnder = (dir: string): string[] =>
  allPages().filter(f => f.startsWith(`${dir}/`) && !f.endsWith('/index.mdx'))

/** Last paragraph of a page, with trailing blank lines dropped. */
const lastParagraph = (text: string): string => {
  const blocks = text.trim().split(/\n\s*\n/)
  return blocks[blocks.length - 1] ?? ''
}

/** Body lines outside fenced code blocks and outside frontmatter. */
const proseLines = (text: string): string[] => {
  const out: string[] = []
  let fence = false
  let fm = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '---' && fm < 2) {
      fm += 1
      continue
    }
    if (fm === 1) continue
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      continue
    }
    if (!fence) out.push(line)
  }
  return out
}

const SPINE = [
  'process-lifecycle/index.mdx',
  'process-lifecycle/phases/index.mdx',
  'process-lifecycle/phases/induction.mdx',
  'process-lifecycle/phases/strategic-planning.mdx',
  'process-lifecycle/phases/iteration.mdx',
  'process-lifecycle/phases/execution.mdx',
  'process-lifecycle/refinement-workflow.mdx',
  'process-lifecycle/delivery-workflow.mdx',
  'process-lifecycle/delivery-cycle.mdx',
  'process-lifecycle/lifecycle-modes.mdx',
  'process-lifecycle/skill-layers.mdx',
  'process-lifecycle/tag-driven-automation.mdx',
]

describe('AC53: Process Lifecycle is a 5-part spine under the process-lifecycle slug', () => {
  it("root nav matches the target structure, Customization dissolved, What's new after Welcome", () => {
    expect(meta('meta.json')).toEqual([
      'index',
      'whats-new',
      'getting-started',
      'process-lifecycle',
      'tutorials',
      'guides',
      'concepts',
      'integrations',
      'pm-tools',
      '---',
      'reference',
      'migrations',
      'support',
      'contributing',
    ])
    expect(exists('developer-journey')).toBe(false)
    expect(exists('customization')).toBe(false)
  })

  it('spine order: overview, phases, refinement, delivery + in depth, modes, layers, tags', () => {
    expect(meta('process-lifecycle/meta.json')).toEqual([
      'phases',
      'refinement-workflow',
      'delivery-workflow',
      'delivery-cycle',
      'lifecycle-modes',
      'skill-layers',
      'tag-driven-automation',
    ])
    expect(meta('process-lifecycle/phases/meta.json')).toEqual([
      'induction',
      'strategic-planning',
      'iteration',
      'execution',
    ])
    for (const page of SPINE) expect(exists(page), page).toBe(true)
    expect(exists('reference/delivery-cycle.mdx')).toBe(false)
  })

  it('overview is trimmed: one next list, no v0.4 leftovers', () => {
    const overview = read('process-lifecycle/index.mdx')
    expect(overview).not.toMatch(/^## Product Lifecycle/m)
    expect(overview).not.toMatch(/^## Card Hierarchy/m)
    expect(overview).not.toMatch(/^## What's Next/m)
    expect(overview).not.toMatch(/^## Reference/m)
    expect(words(overview)).toBeLessThan(900)
  })

  it('every spine and concept page ends with a Next link', () => {
    const concepts = pagesUnder('concepts')
    for (const page of [...SPINE, ...concepts]) {
      const tail = lastParagraph(read(page))
      expect(tail, `${page} should end with "**Next:** [..](/docs/..)"`).toMatch(
        /^\*\*Next:\*\* .*\]\(\/docs\//,
      )
    }
  })

  it('lifecycle modes carry the mode x harness matrix', () => {
    const modes = read('process-lifecycle/lifecycle-modes.mdx')
    expect(modes).toMatch(/^## Modes by assistant/m)
    const header = modes
      .split('\n')
      .find(l => l.startsWith('| Mode |') && l.includes('Claude Code'))
    expect(header, 'matrix header row').toBeDefined()
    for (const h of [
      'Claude Code',
      'Codex',
      'pi',
      'opencode',
      'Cursor',
      'GitHub Copilot',
      'Windsurf',
    ])
      expect(header).toContain(h)
    expect(modes).toContain('/docs/tutorials/automated-development#safety')
  })
})

describe('AC54: three labels for the skill / CLI / plugin paths', () => {
  const lines = (): { page: string; line: string }[] =>
    allPages().flatMap(page => proseLines(read(page)).map(line => ({ page, line })))

  it('guides index defines the three labels', () => {
    const index = read('guides/index.mdx')
    expect(index).toContain('**In your assistant**')
    expect(index).toContain('**With pair-cli**')
    expect(index).toContain('**With `/pair-assistant` (optional, Claude Code)**')
  })

  it('the two-label vocabulary and its apologies are gone', () => {
    const offenders = lines().filter(
      ({ line }) =>
        /With the CLI\b/.test(line) ||
        /is a skill,? not a command/.test(line) ||
        /there is no `?pair-cli`? command/.test(line),
    )
    expect(offenders.map(o => `${o.page}: ${o.line.trim()}`)).toEqual([])
  })

  /** The text a label governs: from the label to the next label on the same line, or the end. */
  const segment = (line: string, label: string): string | null => {
    const i = line.indexOf(label)
    if (i < 0) return null
    const rest = line.slice(i + label.length)
    const j = rest.search(/\*\*(With |In your assistant)/)
    return j < 0 ? rest : rest.slice(0, j)
  }

  it('no slash skill under "With pair-cli"; no cycle/loop/batch skill under "With /pair-assistant"', () => {
    const cliWithSkill = lines().filter(({ line }) => {
      const seg = segment(line, 'With pair-cli')
      return seg !== null && /`\/pair-[a-z-]+/.test(seg)
    })
    expect(cliWithSkill.map(o => `${o.page}: ${o.line.trim()}`)).toEqual([])
    const pluginWithDriver = lines().filter(({ line }) => {
      const seg = segment(line, 'With `/pair-assistant`')
      return seg !== null && /\/pair-(workflow-cycle|loop|implement-batch|refine-batch)/.test(seg)
    })
    expect(pluginWithDriver.map(o => `${o.page}: ${o.line.trim()}`)).toEqual([])
  })
})

describe('AC55: the five stapled guides are recipes; their tails moved', () => {
  it('tails live in Reference, Tutorials or Getting Started', () => {
    for (const page of [
      'reference/cli/install-sources.mdx',
      'reference/cli/update-link.mdx',
      'tutorials/release-testing.mdx',
      'tutorials/share-ai-artifacts.mdx',
      'getting-started/verify.mdx',
    ])
      expect(exists(page), page).toBe(true)
    expect(exists('guides/release-tests.mdx')).toBe(false)
    expect(exists('guides/adoption-checklist.mdx')).toBe(false)
  })

  it('no page carries two Prerequisites headings; no paper form; no verify.sh', () => {
    for (const page of allPages()) {
      const text = read(page)
      const prereqs = text.match(/^## Prerequisites\s*$/gm) ?? []
      expect(
        prereqs.length,
        `${page} has ${prereqs.length} "## Prerequisites"`,
      ).toBeLessThanOrEqual(1)
      expect(text, `${page} references verify.sh`).not.toContain('verify.sh')
      expect(text, `${page} carries the paper form`).not.toContain('Validation Summary')
    }
  })

  it('every guide stays a recipe', () => {
    for (const page of pagesUnder('guides')) {
      const text = read(page)
      expect(words(text), `${page} is a text wall`).toBeLessThan(900)
      expect(text, `${page} lacks the recipe shape`).toMatch(/^## Steps/m)
      expect(text, `${page} lacks the recipe shape`).toMatch(/^## Verify/m)
    }
  })
})

describe('AC56: Customization dissolved; one path page; one org KB guide; quickstart trimmed', () => {
  it('the role quickstarts merged into choose-your-path', () => {
    expect(exists('getting-started/choose-your-path.mdx')).toBe(true)
    for (const gone of ['quickstart-solo', 'quickstart-team', 'quickstart-org'])
      expect(exists(`getting-started/${gone}.mdx`), gone).toBe(false)
    expect(meta('getting-started/meta.json')).toEqual([
      'quickstart',
      'bootstrap-quick-mode',
      'choose-your-path',
      'verify',
    ])
  })

  it('quickstart is install + first run only', () => {
    const quickstart = read('getting-started/quickstart.mdx')
    expect(words(quickstart)).toBeLessThan(500)
    expect(quickstart).toContain('/pair-next')
    expect(quickstart).toContain('/docs/guides/adopt-existing-repo')
  })

  it('Customization pages found their Guides / Reference / Concepts homes', () => {
    expect(exists('guides/customize-for-your-team.mdx')).toBe(true)
    expect(exists('reference/templates-catalog.mdx')).toBe(true)
    expect(exists('concepts/package-local-adoption.mdx')).toBe(true)
    expect(exists('guides/join-a-pair-project.mdx')).toBe(true)
    const guides = meta('guides/meta.json')
    for (const sep of ['---Set up---', '---Knowledge Base---', '---Configure---', '---Deliver---'])
      expect(guides).toContain(sep)
  })

  it('one org KB guide names the default channel and the alternatives', () => {
    const kb = read('guides/external-kb.mdx')
    expect(kb).toContain('scaffold-kb')
    expect(kb).toContain('scripts/release.sh')
    expect(kb).toMatch(/npm/)
    expect(kb).toMatch(/GitHub Release/)
    expect(kb).toContain('/docs/reference/cli/install-sources')
  })
})

describe('AC57: Concepts lists itself; glossary; reference moves', () => {
  it('concepts index links every concept page, grouped', () => {
    const index = read('concepts/index.mdx')
    for (const page of pagesUnder('concepts')) {
      const route = `/docs/${page.replace(/\.mdx$/, '')}`
      expect(index, `concepts/index does not link ${route}`).toContain(`(${route})`)
    }
    expect(index).not.toContain('/docs/process-lifecycle/delivery-workflow)')
  })

  it('glossary exists and the spine links it at first use', () => {
    const glossary = read('concepts/glossary.mdx')
    for (const term of [
      'card',
      'macrostate',
      'harness',
      'engine',
      'seal',
      'handoff',
      'ADL',
      'realization',
      'escalation',
    ])
      expect(glossary, `glossary lacks "${term}"`).toMatch(new RegExp(`^##+ .*\\b${term}\\b`, 'mi'))
    for (const page of [
      'process-lifecycle/index.mdx',
      'process-lifecycle/refinement-workflow.mdx',
      'process-lifecycle/delivery-workflow.mdx',
      'process-lifecycle/lifecycle-modes.mdx',
    ])
      expect(read(page), `${page} does not link the glossary`).toContain('/docs/concepts/glossary#')
  })

  it('cli/workflows merged into cli/examples; batch engine moved to Contributing and scrubbed', () => {
    expect(exists('reference/cli/workflows.mdx')).toBe(false)
    expect(read('reference/cli/examples.mdx')).toMatch(/^## Monorepo/m)
    expect(exists('reference/batch-engine.mdx')).toBe(false)
    const internals = read('contributing/batch-engine-internals.mdx')
    expect(meta('contributing/meta.json')).toContain('batch-engine-internals')
    expect(internals).not.toMatch(/US-\d+/)
    expect(internals).not.toMatch(/\bS1[12]\b/)
    expect(internals).toMatch(/^## Related/m)
  })
})

describe('AC58: factual contradictions fixed', () => {
  it('fresh-card stage order agrees between the guide and the workflow page', () => {
    const order = 'implement → verify → merge'
    expect(read('guides/deliver-a-card.mdx')).toContain(order)
    expect(read('process-lifecycle/delivery-workflow.mdx')).toContain(order)
    expect(read('guides/deliver-a-card.mdx')).not.toContain('prepare, validate, implement, verify')
  })

  it('iteration uses Ready, not the legacy Refined state', () => {
    expect(read('process-lifecycle/phases/iteration.mdx')).not.toMatch(/\bRefined\b/)
  })

  it('automation vocabulary: Autonomy is canonical, Eligibility and Auto-Advance only as legacy', () => {
    const exempt = new Set([
      'migrations/v0.4-to-v0.5.mdx',
      'reference/cli/commands.mdx', // the `run` flag reference names the legacy section it still honours
    ])
    const offenders: string[] = []
    for (const page of allPages()) {
      if (exempt.has(page)) continue
      for (const line of read(page).split('\n')) {
        if (/## (Eligibility|Auto-Advance)/.test(line) && !/legacy/i.test(line))
          offenders.push(`${page}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
    expect(read('process-lifecycle/tag-driven-automation.mdx')).toContain('`## Autonomy`')
  })

  it('Windows support is stated the same way everywhere', () => {
    expect(read('getting-started/quickstart.mdx')).not.toMatch(/macOS or Linux/)
    expect(read('getting-started/quickstart.mdx')).toMatch(/WSL/)
    expect(read('tutorials/first-project.mdx')).toMatch(/WSL/)
  })
})

describe('AC59: captions say what to notice; the lifecycle diagram greets newcomers', () => {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .replace(/^\*figure:\s*/i, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim()

  it('no caption repeats its alt text', () => {
    for (const page of allPages()) {
      const lines = read(page).split('\n')
      lines.forEach((line, i) => {
        if (!/^\*Figure:/.test(line)) return
        const img = lines.slice(Math.max(0, i - 3), i).find(l => /^!\[/.test(l))
        expect(img, `${page}:${i + 1} caption without image`).toBeDefined()
        const alt = img?.match(/^!\[([^\]]*)\]/)?.[1] ?? ''
        expect(norm(line), `${page}:${i + 1} caption repeats the alt text`).not.toBe(norm(alt))
      })
    }
  })

  it('hub and getting-started index show the lifecycle diagram and stay short', () => {
    const hub = read('index.mdx')
    const start = read('getting-started/index.mdx')
    expect(hub).toContain('/diagrams/lifecycle-overview.svg')
    expect(start).toContain('/diagrams/lifecycle-overview.svg')
    expect(words(hub)).toBeLessThan(350)
    expect(words(start)).toBeLessThan(500)
    expect(start.indexOf('## Install')).toBeGreaterThan(start.indexOf('## The three'))
  })
})

describe('AC60: every redirect lands on a page that exists', () => {
  const config = readFileSync(join(WEBSITE, 'next.config.mjs'), 'utf-8')
  const pairs = [...config.matchAll(/\['(\/docs[^']*)',\s*'(\/docs[^']*)'\]/g)].map(m => [
    m[1],
    m[2],
  ])
  const onDisk = new Set(
    allPages().map(f =>
      `/docs/${f.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, ''),
    ),
  )

  it('lists the moved and renamed pages', () => {
    const sources = new Set(pairs.map(p => p[0]))
    for (const s of [
      '/docs/customization',
      '/docs/customization/adopt',
      '/docs/customization/team',
      '/docs/customization/templates',
      '/docs/customization/organization',
      '/docs/customization/external-kb',
      '/docs/customization/package-local-adoption',
      '/docs/getting-started/quickstart-solo',
      '/docs/getting-started/quickstart-team',
      '/docs/getting-started/quickstart-org',
      '/docs/guides/adoption-checklist',
      '/docs/guides/release-tests',
      '/docs/reference/delivery-cycle',
      '/docs/reference/batch-engine',
      '/docs/reference/cli/workflows',
      '/docs/developer-journey/induction',
      '/docs/developer-journey/strategic-planning',
      '/docs/developer-journey/iteration',
      '/docs/developer-journey/execution',
      '/docs/developer-journey/:path*',
    ])
      expect(sources.has(s), `missing redirect for ${s}`).toBe(true)
  })

  it('no redirect chains and no redirect to a 404', () => {
    const sources = new Set(pairs.map(p => p[0]))
    for (const [source, dest] of pairs) {
      const target = dest.replace(/\/:path\*$/, '')
      expect(onDisk.has(target), `${source} -> ${dest} does not resolve to a page`).toBe(true)
      expect(sources.has(dest), `${source} -> ${dest} chains into another redirect`).toBe(false)
      expect(onDisk.has(source), `${source} is both a redirect and a live page`).toBe(false)
    }
  })
})

describe('release validation CP list lives in Contributing (#543 AC11)', () => {
  const page = read('contributing/release-process.mdx')

  it('release-process lists CP1..CP12 and links the suite README', () => {
    for (let n = 1; n <= 12; n++)
      expect(page, `CP${n} missing`).toMatch(new RegExp(`^- \\*\\*CP${n}\\*\\*:`, 'm'))
    expect(page).toContain('/blob/main/qa/release-validation/README.md')
  })

  it('release-testing tutorial stays general: no pair-internal CP11/CP12 or suite link', () => {
    const tutorial = read('tutorials/release-testing.mdx')
    expect(tutorial).not.toMatch(/\bCP1[0-2]\b/)
    expect(tutorial).not.toContain('foomakers/pair/blob/main/qa/release-validation')
  })
})
