/**
 * Conformance guard for `/pair-capability-setup-pm` — the PM-tool configuration skill (story #321).
 *
 * TARGET ARTIFACT, NOT STORY (ADL `2026-07-18-conformance-test-per-file-not-per-story.md`):
 * this file is the home of every checkable claim about `setup-pm/SKILL.md`, in both corpora
 * — the dataset (authoring source of truth) and the generated `.claude/skills/**` mirror.
 * A later story adding a setup-pm claim extends a `describe` here rather than adding a file.
 * The last block additionally covers the Azure adapter's `### Adoption Configuration` snippet
 * and its hand-maintained website twin: those two are not a *new* target so much as the
 * other half of ONE contract — the fields setup-pm must write into `way-of-working.md` —
 * and splitting them from the skill that writes them is exactly the fragmentation the ADL
 * rejects. The cross-cutting `pm-tool-adapter-contract.test.ts` stays reserved for the
 * invariant that spans EVERY adapter (visibility); an Azure-only claim does not belong there.
 *
 * WHY IT EXISTS. The skill drifted against itself: #389 added Azure DevOps and Linear to the
 * Step 2 selection table and the Step 3 guide list, but `## Notes` kept asserting
 * "Supported tools with implementation guides: GitHub Projects, Filesystem" — two screens
 * below a table offering four. Nothing on the gate could see it, because the supported-tools
 * claim was prose nobody compared against the adapters actually shipped on disk.
 *
 * DATA-DRIVEN BY CONSTRUCTION, NO ADAPTER COUNT ASSERTED. The adapter set is discovered from
 * disk (`*-implementation.md`) in both corpora and the tool's display name is read from the
 * adapter's own pinned H1 (`# <Name> - Complete Implementation Guide`) — so no name table is
 * maintained here either. THE INTENDED CONTRACT FOR THE NEXT AUTHOR: the day a 5th adapter
 * lands (say `gitlab-implementation.md`), these cases go red until `setup-pm/SKILL.md` lists
 * it in all three places. That is the guard working, not a mystery failure — the remedy is to
 * enroll the tool in the skill (Step 2 table row + Step 3 guide link + the Notes line), never
 * to relax the assertion. An adapter whose H1 does not carry the pinned form fails loudly for
 * the same reason: a silently-unparsed name would make every claim below vacuously true.
 *
 * Every assertion in this file was injection-tested — the claim was deleted from the artifact
 * and the assertion confirmed to redden — per the vacuous-assertion lesson recorded in
 * `pm-tool-adapter-contract.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { sectionBetween } from './test-utils'

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')
const ADAPTER_REL = '.pair/knowledge/guidelines/collaboration/project-management-tool'

const read = (path: string): string => readFileSync(path, 'utf-8')

/**
 * The two corpora, each pairing the adapters on disk with the setup-pm skill that must list
 * them. Pairing them per corpus (rather than checking the dataset adapters against the root
 * skill) is what makes the mirror's own copy of the claim asserted rather than assumed.
 */
const CORPORA = [
  {
    label: 'dataset',
    adapterDir: join(DATASET, ADAPTER_REL),
    skill: join(DATASET, '.skills/capability/setup-pm/SKILL.md'),
  },
  {
    label: 'generated root',
    adapterDir: join(REPO_ROOT, ADAPTER_REL),
    skill: join(REPO_ROOT, '.claude/skills/pair-capability-setup-pm/SKILL.md'),
  },
]

/** Adapter files present on disk — discovered, never enumerated. */
const adapterFiles = (dir: string): string[] =>
  readdirSync(dir)
    .filter(name => name.endsWith('-implementation.md'))
    .sort()

/** The pinned H1 form every adapter carries; group 1 is the tool's display name. */
const ADAPTER_TITLE = /^# (.+?) - Complete Implementation Guide\s*$/m

const displayName = (content: string, file: string): string => {
  const match = ADAPTER_TITLE.exec(content)
  if (!match) {
    throw new Error(
      `${file}: no "# <Name> - Complete Implementation Guide" H1 — the display name this guard ` +
        `matches against setup-pm cannot be derived. Restore the pinned H1 form.`,
    )
  }
  return (match[1] as string).trim()
}

/**
 * Strips markdown emphasis and code spans, then collapses whitespace — without it an assertion
 * requiring two adjacent words goes vacuously green the moment prose puts `**bold**` between
 * them, which is exactly how the Notes line hid its own contradiction.
 */
const normalize = (markdown: string): string =>
  markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const adapterCases = CORPORA.flatMap(({ label, adapterDir, skill }) =>
  adapterFiles(adapterDir).map(file => {
    const content = read(join(adapterDir, file))
    return { corpus: label, file, tool: displayName(content, file), skillText: read(skill) }
  }),
)

const skillCases = CORPORA.map(({ label, skill }) => ({ corpus: label, skillText: read(skill) }))

describe('setup-pm SKILL.md — every adapter on disk is a selectable tool (#321)', () => {
  it('discovers adapters from disk in both corpora', () => {
    // Not a count assertion — a non-empty guard, so the data-driven cases below can never
    // pass vacuously by iterating an empty list.
    for (const { label, adapterDir } of CORPORA) {
      expect(adapterFiles(adapterDir).length, `no adapters found in ${label}`).toBeGreaterThan(0)
    }
  })

  it.each(adapterCases)(
    '$corpus — Step 2 offers $tool as Available (AC-1/AC-8)',
    ({ tool, skillText }) => {
      const step2 = sectionBetween(skillText, '### Step 2: Select PM Tool', '### Step 3:')
      const row = step2.split('\n').find(line => line.includes('|') && line.includes(`**${tool}**`))
      expect(row, `Step 2 selection table has no row for ${tool}`).toBeDefined()
      expect(normalize(row as string)).toContain('available')
      // AC-8: an adapter that ships must not be filed under the no-guide HALT row.
      expect(normalize(row as string)).not.toContain('no implementation guide')
    },
  )

  it.each(adapterCases)('$corpus — Step 3 links $file (AC-1)', ({ file, skillText }) => {
    const step3 = sectionBetween(skillText, '### Step 3: Apply Implementation Guide', '### Step 4:')
    expect(step3).toMatch(new RegExp(`\\]\\([^)]*${escapeRegExp(file)}\\)`))
  })

  it.each(adapterCases)(
    '$corpus — the Notes supported-tools line names $tool (AC-1)',
    ({ tool, skillText }) => {
      const notes = skillText.slice(skillText.indexOf('## Notes'))
      expect(notes.length, 'no ## Notes section').toBeGreaterThan(0)
      const claim = notes
        .split('\n')
        .find(line => normalize(line).includes('supported tools with implementation guides'))
      expect(claim, 'no supported-tools claim in ## Notes').toBeDefined()
      expect(normalize(claim as string)).toContain(tool.toLowerCase())
    },
  )
})

describe('setup-pm SKILL.md — the tool-agnostic contract holds (#321)', () => {
  it.each(skillCases)(
    '$corpus — the tool argument row points at the canonical token table, never copies it',
    ({ skillText }) => {
      const args = sectionBetween(skillText, '## Arguments', '## Composed Skills')
      const row = args.split('\n').find(line => line.includes('`$tool`') && line.startsWith('|'))
      expect(row, 'no $tool argument row').toBeDefined()
      // AC-2: the accepted values are resolved BY REFERENCE — the single source of truth is
      // the convention, so a token added there is not a two-place edit.
      expect(row as string).toMatch(/way-of-working-pm-resolution\.md/)
      // ...and the Edge Cases keep an unrecognized token from being coerced to a near match.
      const edges = sectionBetween(skillText, '## Edge Cases', '## Graceful Degradation')
      expect(normalize(edges)).toMatch(/invalid \$tool token[\s\S]{0,240}step 2/)
    },
  )

  it.each(skillCases)(
    '$corpus — the Azure walkthrough runs detection before any configuration write (AC-3)',
    ({ skillText }) => {
      const step3 = sectionBetween(
        skillText,
        '### Step 3: Apply Implementation Guide',
        '### Step 4:',
      )
      const azure = step3.split('\n').find(line => normalize(line).includes('for azure devops:'))
      expect(azure, 'no Azure DevOps walkthrough bullet in Step 3').toBeDefined()
      const claim = normalize(azure as string)
      // The adapter's own gate, by name — not a bare mention of `az` authentication.
      expect(claim).toContain('detection and halt behavior')
      expect(claim).toMatch(/before any configuration write/)
      // The skill still never installs or authenticates on its own.
      expect(claim).toMatch(/never installs|neither installs|does not install/)
    },
  )

  it.each(skillCases)(
    '$corpus — Step 4 writes the fields the Azure adapter reads back (AC-4/AC-6)',
    ({ skillText }) => {
      const step4 = sectionBetween(skillText, '### Step 4: Update Way-of-Working', '### Step 5:')
      // SCOPED PER ACT-STEP, not over the whole of Step 4. The injection sweep caught the
      // unscoped version passing vacuously: `team` and `area path` also occur in the AC-6
      // report step, and `invisible` in the pre-existing `## Assignment` paragraph, so a
      // whole-section `toContain` stayed green with the AC-4 claim deleted. Slicing by the
      // step's own bolded title fails CLOSED (`sectionBetween` throws on a miss).
      const FIELDS = '**Act**: Add or update the PM tool section with:'
      const STATE_MAPPING = '**Act — `## State Mapping`'
      const REPORT = '**Act — report what could not be resolved**'
      const GIT_WORKFLOW = '**Act — `## Git Workflow`'

      // AC-4: team + area path are what `--area` on every create is taken from, and they are
      // named in the field list the skill writes — not merely somewhere in the step.
      const fields = normalize(sectionBetween(step4, FIELDS, STATE_MAPPING))
      expect(fields).toContain('area path')
      expect(fields).toContain('team')

      // AC-4: a `## State Mapping` section built from real WORK ITEM states. The skill stays
      // tool-agnostic — it links the schema rather than copying state literals into itself.
      const stateStep = sectionBetween(step4, STATE_MAPPING, REPORT)
      const stateClaim = normalize(stateStep)
      expect(stateClaim).toContain('## state mapping')
      expect(stateClaim).toContain('work item state')
      expect(stateClaim).toContain('board column')
      expect(stateStep).toMatch(/canonical-states\.md/)

      // AC-6: an unresolvable field is REPORTED as a follow-up, never silently dropped.
      const reportClaim = normalize(sectionBetween(step4, REPORT, GIT_WORKFLOW))
      expect(reportClaim).toMatch(/report it to the developer/)
      expect(reportClaim).toMatch(/outside the team's board view/)
      expect(reportClaim).toMatch(/never silently omit/)
    },
  )
})

describe('Azure adapter Adoption Configuration and its website twin agree (#321 AC-5)', () => {
  const ADAPTER = 'azure-devops-implementation.md'
  const WEBSITE = join(REPO_ROOT, 'apps/website/content/docs/pm-tools/azure-devops.mdx')

  /** The single fenced ```markdown block of a section — the snippet a reader copies. */
  const snippet = (section: string, label: string): string => {
    const match = /```markdown\n([\s\S]*?)```/.exec(section)
    if (!match) throw new Error(`${label}: no fenced markdown snippet`)
    return (match[1] as string).trim()
  }

  const adapterSnippet = (dir: string): string =>
    snippet(
      sectionBetween(read(join(dir, ADAPTER)), '### Adoption Configuration', '## Work Item'),
      `${dir}/${ADAPTER}`,
    )

  it.each(CORPORA)('$label — the snippet declares team and area path', ({ adapterDir }) => {
    const claim = normalize(adapterSnippet(adapterDir))
    expect(claim).toContain('team:')
    expect(claim).toContain('area path:')
  })

  it('the website Configuration snippet is the same text, verbatim', () => {
    // Hand-maintained twin (no derivation mechanism, by design) — so the equality is asserted.
    const website = snippet(
      sectionBetween(read(WEBSITE), '## Configuration', '### Prerequisites'),
      'azure-devops.mdx',
    )
    expect(website).toBe(adapterSnippet(join(REPO_ROOT, ADAPTER_REL)))
  })
})

/**
 * `$tool` VALIDITY IS TWO-CONDITION (r1-g1). The `## Arguments` row defines the accepted values
 * BY REFERENCE — the canonical alias table in `way-of-working-pm-resolution.md#code-host-resolution`.
 * That table is a CODE-HOST alias table and a strict SUPERSET of what setup-pm can configure: it
 * carries `gitlab` / `gitlab-issues`, for which no adapter ships. Membership in it therefore cannot
 * be the whole of "valid", or `/pair-capability-setup-pm $tool: gitlab` passes Step 2.1's validity
 * check, takes the Step 2.2 skip into Step 3 — which has no GitLab guide row — and the executor
 * improvises a way-of-working write for an unsupported tracker, while the Step 2.4 HALT (worded for
 * the interactive path, "if developer SELECTS") never runs.
 *
 * ORACLE: the alias table (products) vs the adapters on disk (`*-implementation.md`) — both
 * DISCOVERED, never enumerated here, so the guideless set is re-derived on every run and the day a
 * `gitlab-implementation.md` ships the gap closes by itself rather than by editing this file. The
 * gate assertions below stay structural on purpose: the rule must be two-condition WITHOUT copying
 * the token list back into the skill, which is the duplication the by-reference row removed.
 */
const CONVENTION_REL =
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md'

/** Lowercased, punctuation-free — `Azure DevOps`, `azure-devops` and `azuredevops` all collapse. */
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Products of the canonical alias table, parsed from the convention itself. Fails closed. */
const aliasProducts = (
  conventionText: string,
  label: string,
): { product: string; tokens: string[] }[] => {
  const table = sectionBetween(conventionText, '| Product', 'canonical token set')
  const rows = table
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !line.includes('---') && !line.includes('Equivalent'))
    .map(line =>
      line
        .split('|')
        .map(cell => cell.trim())
        .filter(Boolean),
    )
    .filter(cells => cells.length === 2)
    .map(cells => ({
      product: cells[0] as string,
      tokens: ((cells[1] as string).match(/`[^`]+`/g) ?? []).map(token => token.replace(/`/g, '')),
    }))
  if (rows.length === 0) throw new Error(`${label}: canonical alias table parsed to zero products`)
  return rows
}

/** An alias-table product is supported iff an adapter file or its pinned H1 name matches it. */
const productHasAdapter = (
  product: string,
  adapters: { file: string; tool: string }[],
): boolean => {
  const key = slug(product)
  return adapters.some(
    ({ file, tool }) =>
      slug(file.replace('-implementation.md', '')).startsWith(key) || slug(tool).startsWith(key),
  )
}

/** Step 2 split into its numbered items — robust to renumbering and to rewording. */
const step2Items = (skillText: string): string[] =>
  sectionBetween(skillText, '### Step 2: Select PM Tool', '### Step 3:')
    .split(/\n(?=\d+\. \*\*)/)
    .slice(1)

/** Items 2.1-2.2: the validity check and the skip that routes a valid `$tool` past selection. */
const validityGateItems = (skillText: string): string[] => {
  const items = step2Items(skillText)
  const selection = items.findIndex(item => item.includes('Present PM tool options'))
  if (selection <= 0) throw new Error('Step 2: no interactive-selection item to bound the gate')
  return items.slice(0, selection)
}

const validityGate = (skillText: string): string => validityGateItems(skillText).join('\n')

/**
 * The ONE gate item that carries the adapter condition — where the two-condition rule has to live,
 * because a condition stated in a different item than the one that resolves the token can be read
 * (and executed) as two independent checks. Undefined at `$base`: no item mentions a guide at all.
 */
const guideConditionItem = (skillText: string): string | undefined =>
  validityGateItems(skillText).find(item => /implementation guide|adapter/.test(normalize(item)))

/** `token` as a whole identifier — never a fragment of a longer one. */
const spelledOut = (text: string, token: string): boolean =>
  new RegExp(`(^|[^a-z0-9-])${escapeRegExp(token)}([^a-z0-9-]|$)`).test(text)

const haltItem = (skillText: string): string => {
  const item = step2Items(skillText).find(entry => entry.includes('HALT'))
  if (!item) throw new Error('Step 2: no HALT item')
  return item
}

const toolArgRow = (skillText: string): string => {
  const args = sectionBetween(skillText, '## Arguments', '## Composed Skills')
  const row = args.split('\n').find(line => line.includes('`$tool`') && line.startsWith('|'))
  if (!row) throw new Error('## Arguments: no `$tool` row')
  return row
}

const validityCases = CORPORA.map(({ label, adapterDir, skill }) => {
  const adapters = adapterFiles(adapterDir).map(file => ({
    file,
    tool: displayName(read(join(adapterDir, file)), file),
  }))
  const products = aliasProducts(
    read(join(label === 'dataset' ? DATASET : REPO_ROOT, CONVENTION_REL)),
    label,
  )
  const supported = products.filter(({ product }) => productHasAdapter(product, adapters))
  return {
    corpus: label,
    skillText: read(skill),
    adapters,
    products,
    guideless: products.filter(({ product }) => !productHasAdapter(product, adapters)),
    // Every spelling the table gives a product that DOES ship an adapter, and the subset of those
    // that are NOT the product's own name. Derived from the table, never enumerated here: the day
    // it gains a spelling, the cases below cover it without an edit to this file.
    supportedTokens: supported.flatMap(({ product, tokens }) =>
      tokens.map(token => ({ product, token })),
    ),
    aliasTokens: supported.flatMap(({ product, tokens }) =>
      tokens.filter(token => slug(token) !== slug(product)),
    ),
    tokens: products.flatMap(({ tokens }) => tokens),
  }
})

describe('setup-pm SKILL.md — $tool validity is tied to a shipped adapter (#321)', () => {
  it.each(validityCases)(
    '$corpus — the canonical token set is a strict superset of the adapters (oracle is non-vacuous)',
    ({ products, adapters, guideless }) => {
      // Guard, not a count assertion: proves both sides of the oracle were really discovered, so
      // the rows below can never be vacuously satisfied by an empty parse.
      expect(products.length, 'canonical alias table parsed to nothing').toBeGreaterThan(0)
      expect(adapters.length, 'no adapters discovered on disk').toBeGreaterThan(0)
      // Not asserted as non-empty: shipping the missing adapter is a legitimate way to empty it.
      expect(guideless.length).toBeLessThan(products.length)
    },
  )

  it.each(validityCases)(
    '$corpus — Step 2 conditions validity on an implementation guide, not on the token table alone',
    ({ skillText }) => {
      const gate = normalize(validityGate(skillText))
      // Condition 1 — the token resolves through the canonical alias table.
      expect(
        gate,
        'the validity check does not resolve the token through the canonical table',
      ).toMatch(/canonical|alias|way-of-working-pm-resolution/)
      // Condition 2 — AND the resolved product actually has an adapter. Without this, `gitlab` is
      // "valid" (it IS a canonical token) and the skip below carries it into Step 3.
      expect(gate, 'the validity check never requires an implementation guide to exist').toMatch(
        /implementation guide|adapter/,
      )
    },
  )

  it.each(validityCases)(
    '$corpus — the Step 2 HALT is reachable from the tool-argument path, not only from selection',
    ({ skillText }) => {
      const halt = normalize(haltItem(skillText))
      expect(halt, 'the HALT lost its trigger').toMatch(
        /without an implementation guide|no implementation guide/,
      )
      // Worded only for the interactive path ("if developer SELECTS"), the HALT cannot fire for a
      // token supplied as an argument — the exact hole `$tool: gitlab` falls through.
      expect(
        halt,
        'the HALT is worded for the interactive path only — `$tool` never reaches it',
      ).toMatch(/\$tool/)
    },
  )

  it.each(validityCases)(
    '$corpus — the tool-argument row qualifies the token table without copying it',
    ({ skillText, tokens }) => {
      const row = toolArgRow(skillText)
      // The by-reference pointer stays (asserted above too) — this adds the missing qualifier, so a
      // caller reading the row cannot conclude that every canonical token is configurable.
      expect(row).toMatch(/way-of-working-pm-resolution\.md/)
      expect(
        normalize(row),
        'the row advertises the whole canonical token set as accepted, unqualified',
      ).toMatch(/implementation guide|adapter/)
      // The OTHER half of by-reference, and the reason the pointer exists: the qualifier must not
      // arrive as a pasted token list, which restores the two-place edit. Exactly one spelling
      // survives — the illustration the row already carries (`azure-devops`); a second one means
      // the set was copied back in. Spellings come from the table, so this cannot go stale.
      const copied = tokens.filter(token => spelledOut(normalize(row), token))
      expect(
        copied.length,
        `the $tool row spells out canonical tokens (${copied.join(', ')}) instead of pointing at ` +
          `the table — the single source of truth becomes two the moment a tracker is added`,
      ).toBeLessThanOrEqual(1)
    },
  )

  it.each(validityCases)(
    '$corpus — the guide condition is keyed on the RESOLVED PRODUCT, not on the literal token',
    ({ skillText, aliasTokens }) => {
      // Step 3.1 keys its rows on PRODUCTS (GitHub, Filesystem, Azure DevOps, Linear), so a rule
      // reading "the canonical token table lists it AND an implementation guide ships for it"
      // still breaks: `github-projects` and `azure-boards` — spellings this skill's own Step 2.3
      // table and `## Notes` advertise — match no guide row and get swept into the Step 2.4 HALT
      // with `gitlab`. The token must resolve to a PRODUCT first, and that has to be said in the
      // same item as the guide condition, per the convention's "equality is per product, not per
      // spelling".
      const item = guideConditionItem(skillText)
      expect(
        item,
        'no Step 2 item conditions validity on an implementation guide at all',
      ).toBeDefined()
      const rule = normalize(item as string)
      expect(rule, 'the guide condition never resolves the token — it reads the spelling').toMatch(
        /resolv/,
      )
      expect(rule, 'the guide condition is not keyed on the resolved product').toMatch(/product/)
      // Non-vacuity: a product/spelling distinction is only observable while the table really
      // gives some adapter-backed product a second spelling. If it stops, re-derive this guard
      // rather than deleting the rule.
      expect(
        aliasTokens.length,
        'no adapter-backed product has a non-canonical spelling in the alias table — the ' +
          'per-product rule became unobservable, re-derive this guard',
      ).toBeGreaterThan(0)
    },
  )

  it.each(validityCases)(
    '$corpus — a token whose product ships an adapter still routes to Step 3 (no over-correction)',
    ({ skillText, supportedTokens }) => {
      // The ordinary complement: hardening the gate must not turn `azure-boards` into a HALT.
      expect(normalize(validityGate(skillText))).toMatch(/proceed to step 3/)
      // ...and the omitted-`$tool` path still presents the interactive selection.
      expect(normalize(toolArgRow(skillText))).toMatch(/if omitted/)
      expect(step2Items(skillText).some(item => item.includes('Present PM tool options'))).toBe(
        true,
      )
      // ...and no spelling of an adapter-backed product is enumerated as a HALT case: the HALT is
      // for a product with no guide, whatever the caller spelled. Matched as a literal token, so
      // the selection table's display name ("GitHub Projects") cannot pass for `github-projects`.
      const halt = normalize(haltItem(skillText))
      for (const { product, token } of supportedTokens) {
        expect(
          spelledOut(halt, token),
          `${token} spells ${product}, which ships an adapter — the HALT must not name it`,
        ).toBe(false)
      }
    },
  )

  it.each(validityCases)(
    '$corpus — every canonical product with no adapter is named as taking the HALT',
    ({ skillText, guideless }) => {
      const notes = normalize(skillText.slice(skillText.indexOf('## Notes')))
      const claim = notes.split(' - ').find(line => line.includes('takes the step 2.4 halt'))
      expect(
        claim,
        'no line in ## Notes routes the unsupported tools to the Step 2.4 HALT',
      ).toBeDefined()
      for (const { product } of guideless) {
        expect(
          slug(claim as string),
          `${product} is a canonical token with no adapter and is not routed to the HALT`,
        ).toContain(slug(product))
      }
    },
  )
})
