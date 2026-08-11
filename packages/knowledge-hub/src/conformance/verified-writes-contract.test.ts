import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Conformance guard for the **verified-write contract** (story #403) — the
 * skill-side half of #402's adapter work.
 *
 * #402 fixed the MECHANICS in the PM-tool adapters (membership branch, assignee
 * recipes). What it left open is the CONTRACT in the skills that reach them:
 * `assignee` appeared zero times in `/write-issue`'s SKILL.md, so a caller had no
 * way to pass one; the board write assumed a field existed to write; and
 * `/publish-pr` opened PRs (#404, #405, #406, #408 — verified live) with no
 * assignee at all, #406 also without its story's `risk:*` labels.
 *
 * THE GOVERNING FACT, verified three times on the real tracker (2026-08-04):
 * `gh project item-add` exits 0 WITHOUT creating the item — a second, identical
 * invocation created it. So the invariant this file guards is not "call the add
 * before the state write"; it is:
 *
 *   NO WRITE IS ASSUMED — EVERY WRITE IS RE-READ BACK.
 *
 * A write whose effect cannot be confirmed by a read is a failure or a finding,
 * never a silent success. That rule is what stops the defect CLASS (#384 and
 * #372 sat off the board while looking green); the individual ordering fix only
 * stops one instance of it.
 *
 * CROSS-CUTTING BY CONSTRUCTION, hence its own file rather than an extension of
 * an existing per-artifact one — the explicit exception in
 * `decision-log/2026-07-18-conformance-test-per-file-not-per-story.md`. The
 * invariant spans four artifacts that must agree: two skills (`/write-issue`,
 * `/publish-pr`), the resolution convention that owns the schema, and the
 * way-of-working files that declare the field. A cascade implemented in one
 * skill and not the other reproduces exactly the half-applied state this story
 * exists to remove, so the two are asserted side by side.
 *
 * BOTH CORPORA. Every skill/KB claim is asserted on the dataset (the authoring
 * source of truth) AND on the generated root mirror an installed project
 * actually reads. Byte-equality of the two is a separate guard (#352); here we
 * only assert the claim survived the copy.
 */

const DATASET = join(__dirname, '../../dataset')
const REPO_ROOT = join(__dirname, '../../../..')

const read = (path: string): string => readFileSync(path, 'utf-8')

/**
 * The same normalization the sibling adapter-contract guard uses: strip markdown
 * emphasis and code spans, collapse whitespace, lowercase.
 *
 * Without it, an assertion requiring two adjacent words goes vacuously green the
 * moment prose puts a `code span` or **bold** marker between them. Every claim
 * below is matched against normalized text, and every one was injection-tested
 * by deleting the claim from BOTH corpora and confirming the assertion reddens.
 */
function normalize(markdown: string): string {
  return markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
}

/**
 * A skill's two on-disk copies: the dataset source and the installed mirror.
 *
 * The mirror renames the skill (`write-issue` → `pair-capability-write-issue`)
 * and rewrites every `/command` reference, so NO assertion here may spell a
 * skill name — the claims are pinned on prose that is identical in both copies.
 * That constraint is deliberate: it also keeps the guard from going green on a
 * mere name mention instead of the rule.
 */
function skillCorpora(category: string, name: string): { corpus: string; content: string }[] {
  return [
    { corpus: 'dataset', content: read(join(DATASET, `.skills/${category}/${name}/SKILL.md`)) },
    {
      corpus: 'generated root',
      content: read(join(REPO_ROOT, `.claude/skills/pair-${category}-${name}/SKILL.md`)),
    },
  ]
}

const writeIssueCases = skillCorpora('capability', 'write-issue')

/** The section body of `### <heading>`, up to the next heading of level ≤ 3. */
function section(markdown: string, headingPrefix: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => line.trimEnd().startsWith(`### ${headingPrefix}`))
  if (start === -1) return ''
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3} /.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

describe('/write-issue — $assignee is part of the parameter contract (#403 AC1)', () => {
  it.each(writeIssueCases)('$corpus: declares $$assignee in the Arguments table', ({ content }) => {
    // The literal defect: `assignee` appeared ZERO times in this file, so the
    // adoption's Assignment rule was unenforceable at the contract level.
    expect(content).toMatch(/^\|\s*`\$assignee`\s*\|/m)
  })

  it.each(writeIssueCases)(
    '$corpus: writes the assignee on the create AND the update path',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('as part of the create and of the update, never as a follow-up step')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: names the assignee in the field-configuration enumeration',
    ({ content }) => {
      // Step 7.2 delegated "project field settings (priority, type, status)" — an
      // enumeration that EXCLUDED the assignee, which is how the delegation to the
      // adapters (#402) never reached the assignee mechanic they document.
      expect(normalize(content)).toContain('priority, type, status, assignee')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: states the assignee is ignored in comment mode',
    ({ content }) => {
      // Comment mode is the non-destructive path: it must stay byte-identical on the
      // item's body, labels AND assignee.
      const body = normalize(content)
      expect(body).toMatch(/in comment mode only \$id and \$comment are read/)
      expect(body).toContain('$assignee')
    },
  )
})

describe('/write-issue — the assignee resolution cascade (#403 AC2, AC3)', () => {
  const cascadeSection = (content: string): string =>
    normalize(section(content, 'Step 6b: Resolve the Assignee'))

  it.each(writeIssueCases)('$corpus: has a dedicated assignee-resolution step', ({ content }) => {
    expect(content).toMatch(/^### Step 6b: Resolve the Assignee/m)
  })

  it.each(writeIssueCases)('$corpus: states the cascade in one order (AC2)', ({ content }) => {
    expect(cascadeSection(content)).toContain(
      'the argument first, then the adoption default, then none',
    )
  })

  it.each(writeIssueCases)(
    '$corpus: resolves the default from the adoption field',
    ({ content }) => {
      const body = cascadeSection(content)
      expect(body).toContain('default-assignee')
      expect(body).toContain('assignment')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an unresolvable assignee warns and still writes the item (AC3)',
    ({ content }) => {
      const body = cascadeSection(content)
      expect(body).toContain('write the item without an assignee and warn')
      // The failure mode is invisibility, and refusing to file the item would be a
      // WORSE outcome than filing it unassigned — so this branch must never HALT.
      expect(body).toContain('never a halt')
      expect(body).toContain('invisible in an assignee-filtered view')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: never defaults the assignee to the authenticated user',
    ({ content }) => {
      // The bot-token case: "whoever is running the command" is right only for a solo
      // maintainer, and assigns every item to the bot the moment an agent runs under
      // one — satisfying the letter of the Assignment rule while defeating its purpose.
      const body = cascadeSection(content)
      expect(body).toContain('never the authenticated user')
      expect(body).toContain('bot token')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an empty adoption field is treated as absent',
    ({ content }) => {
      expect(cascadeSection(content)).toContain(
        'an empty value is absent, not an empty-string assignee',
      )
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an assignee the tool rejects is reported, never silently dropped',
    ({ content }) => {
      const body = cascadeSection(content)
      // Same wording as the adapters (#402), so the skill and the guides read as one rule.
      expect(body).toContain('never drop it silently')
      // …and a bookkeeping field must not sink the item.
      expect(body).toContain('never sinks the item')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: leaves the per-tool mechanic to the adapter',
    ({ content }) => {
      // One rule here, six adapters there — the field/flag that actually sets the
      // assignee is the implementation guide's, never invented in the skill.
      expect(cascadeSection(content)).toContain('never invent')
    },
  )
})
