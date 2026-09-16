import { describe, it, expect } from 'vitest'
import { readWorkflowMapping } from './workflow-mapping'

const section = (body: string): string => `# Automation Policy

## Eligibility

risk:green

## Workflows

${body}
`

describe('readWorkflowMapping — the opt-in boundary', () => {
  it('returns undefined when the file declares no `## Workflows` section', () => {
    expect(readWorkflowMapping('## Eligibility\n\nrisk:green\n')).toBeUndefined()
  })

  it('is not confused by a `## Workflows` heading rendered inside a fenced example', () => {
    const markdown = [
      '## Eligibility',
      '',
      'risk:green',
      '',
      '```markdown',
      '## Workflows',
      '',
      'auto-dev ⇒ pair-loop',
      '```',
      '',
    ].join('\n')

    expect(readWorkflowMapping(markdown)).toBeUndefined()
  })

  it('reads one entry per line, in declaration order', () => {
    const mapping = readWorkflowMapping(
      section('auto-dev ⇒ pair-loop\nauto-refine ⇒ pair-process-refine-story'),
    )

    expect(mapping?.routes).toEqual([
      { tag: 'auto-dev', workflow: 'pair-loop' },
      { tag: 'auto-refine', workflow: 'pair-process-refine-story' },
    ])
    expect(mapping?.precedence).toBeUndefined()
  })

  it('reads the optional `Precedence:` line as an ordered list', () => {
    const mapping = readWorkflowMapping(
      section(
        'auto-dev ⇒ pair-loop\nauto-refine ⇒ pair-process-refine-story\nPrecedence: auto-refine, auto-dev',
      ),
    )

    expect(mapping?.precedence).toEqual(['auto-refine', 'auto-dev'])
  })

  it('keeps a tag carrying spaces as ONE routing key', () => {
    const mapping = readWorkflowMapping(section('good first issue ⇒ pair-loop'))

    expect(mapping?.routes).toEqual([{ tag: 'good first issue', workflow: 'pair-loop' }])
  })
})

describe('readWorkflowMapping — HALT triggers', () => {
  const halts = (body: string, expected: string | RegExp): void => {
    expect(() => readWorkflowMapping(section(body))).toThrow(expected)
  }

  it('HALTs on a present-but-empty section (a half-written declaration)', () => {
    expect(() => readWorkflowMapping('## Workflows\n\n## Eligibility\n\nrisk:green\n')).toThrow(
      /present but empty/,
    )
  })

  it('HALTs on the ASCII arrow, naming the documented spelling', () => {
    halts('auto-dev => pair-loop', /⇒/)
  })

  it('HALTs on a line matching neither grammar', () => {
    halts('auto-dev runs the develop workflow', /matches neither/)
  })

  it('HALTs on the same tag declared twice, rather than letting one win silently', () => {
    halts('auto-dev ⇒ pair-loop\nauto-dev ⇒ pair-next', /declares the tag `auto-dev` twice/)
  })

  it('HALTs on a tag that could not be a label on the host', () => {
    halts(`${'x'.repeat(51)} ⇒ pair-loop`, /label cap/)
  })

  it('HALTs on a tag carrying a comma or a boolean operator', () => {
    halts('auto-dev, auto-refine ⇒ pair-loop', /exactly one label/)
    halts('auto-dev OR auto-refine ⇒ pair-loop', /exactly one label/)
  })

  it('HALTs on a copied markdown wrapper instead of a bare entry line', () => {
    halts('- auto-dev ⇒ pair-loop', /markdown wrapper/)
  })

  /**
   * The paste the guideline invites: its own declaration is DISPLAYED inside a ```markdown fence,
   * so an operator copying the block brings the fence markers with it. `sectionBodies` keeps them
   * (a fence is not a heading), so the fence line reaches `readRoute` — where "matches neither
   * `<tag> ⇒ <workflow>` nor `Precedence: …`" sends the maintainer hunting for a malformed route in
   * a line that is not one. The same paste under `## Eligibility` already names the real cause.
   */
  it('names the copied fence for what it is, rather than reporting it as a malformed route', () => {
    halts('```\nauto-dev ⇒ pair-loop\n```', /markdown wrapper/)
    halts('```text\nauto-dev ⇒ pair-loop\n```', /markdown wrapper/)
    // The wrapper is reported before the arrow spelling: fixing the arrow first would only earn a
    // second HALT on the same paste.
    halts('```\nauto-dev => pair-loop\n```', /markdown wrapper/)
  })

  it('HALTs on a tag that could turn into a command fragment in an agent prompt', () => {
    halts('auto-$(whoami) ⇒ pair-loop', /command fragment/)
  })

  it('HALTs on a workflow name that is not a plain identifier', () => {
    halts('auto-dev ⇒ ../../etc/passwd', /plain identifier/)
    halts('auto-dev ⇒ pair loop', /plain identifier/)
  })

  it('HALTs on more than one `Precedence:` line', () => {
    halts('auto-dev ⇒ pair-loop\nPrecedence: auto-dev\nPrecedence: auto-dev', /one `Precedence:`/)
  })

  it('HALTs on a precedence entry naming a tag the mapping does not declare', () => {
    halts('auto-dev ⇒ pair-loop\nPrecedence: auto-dev, auto-triage', /auto-triage/)
  })

  it('HALTs on a precedence list repeating a tag', () => {
    halts('auto-dev ⇒ pair-loop\nPrecedence: auto-dev, auto-dev', /twice/)
  })

  it('HALTs on an empty precedence list', () => {
    halts('auto-dev ⇒ pair-loop\nPrecedence:', /at least one tag/)
  })

  it('HALTs on more than one `## Workflows` heading', () => {
    const markdown = `## Workflows

auto-dev ⇒ pair-loop

## Workflows

auto-refine ⇒ pair-next
`
    expect(() => readWorkflowMapping(markdown)).toThrow(/headings/)
  })

  it('names the adoption file in every HALT, so the fix is actionable', () => {
    expect(() => readWorkflowMapping(section('auto-dev => pair-loop'))).toThrow(
      /\.pair\/adoption\/tech\/automation\.md/,
    )
  })
})
