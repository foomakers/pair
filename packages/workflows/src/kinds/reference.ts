import { describeType } from '../dispatch'
import { KIND_NAMES } from '../grammar'
import type { JsonSchema } from '../schema'
import { kindByName } from '.'
import { COMMON_RESULT } from './kind'

/** One bullet per field of a schema: name, type, and what it is for. `marked` flags the fields that are not required. */
function fields(schema: JsonSchema, marked = false): string[] {
  const entries = Object.entries(schema.properties ?? {})
  if (entries.length === 0) return [`  - ${schema.description ?? 'None.'}`]
  return entries.map(([name, field]) => {
    const optional = marked && !schema.required?.includes(name) ? ', optional' : ''
    const about = field.description === undefined ? '' : ` — ${field.description}`
    return `  - \`${name}\`: \`${describeType(field)}\`${optional}${about}`
  })
}

function section(name: (typeof KIND_NAMES)[number]): string[] {
  const kind = kindByName[name]
  const returns = Object.entries(kind.returns)
  const skill =
    kind.host === true
      ? 'none: the host runs it, no agent'
      : kind.defaultSkill === undefined
        ? 'none: `skill` is required'
        : `\`${kind.defaultSkill}\``
  return [
    `## ${name}`,
    '',
    `- **Default skill**: ${skill}`,
    `- **Default interactive**: \`${String(kind.defaultInteractive)}\``,
    ...(kind.handoff === undefined ? [] : [`- **Handoff**: \`${kind.handoff}\``]),
    '- **Inputs**',
    ...fields(kind.inputs),
    `- **Outputs**, required when \`status\` is \`ok\`${kind.rule === undefined ? '' : ' or `failed`'}`,
    ...fields(kind.outputs),
    ...(kind.rule === undefined ? [] : [`- **Rule**: ${kind.rule.text}`]),
    '- **Options** (`with`)',
    ...fields(kind.with),
    '- **Non-ok returns**',
    ...(returns.length === 0
      ? ['  - None.']
      : returns.map(([status, when]) => `  - \`${status}\`: ${when}`)),
    '',
  ]
}

/** The kind reference page, generated from the kind objects. A test fails when the published page differs. */
export function renderKindReference(): string {
  return [
    '# Workflow step kinds',
    '',
    '<!-- Generated from packages/workflows/src/kinds by `pnpm --filter @pair/workflows kinds:reference`. Do not edit by hand. -->',
    '',
    'A step of a [workflow file](workflow-grammar.md) has a `kind`. The kind says which skill runs by default, what the step receives, which options it accepts under `with`, and what it must return.',
    '',
    '## The result every step returns',
    '',
    'The agent ends its turn with one JSON object in a fenced `json` block. Whatever the kind, it carries:',
    '',
    ...fields(COMMON_RESULT, true).map(line => line.slice(2)),
    '',
    'An agent can return `ok` and the statuses listed for its kind below.',
    'The `returns` contract describes when each non-success outcome applies. The workflow decides what happens next through [`escalate`](workflow-grammar.md#outcomes-and-escalation). The engine produces `exhausted` and `skipped`.',
    '',
    'Agent steps can set top-level `timeout-minutes` (a positive integer that overrides the run timeout) and `retries` (a nonnegative integer, default 0). These keys are unavailable on host-run kinds.',
    '',
    'An invalid final result makes the step `failed` with reason `invalid-result` after retries are exhausted. Other process faults end a step that declares `retries` as `blocked` with reason `fault`. Without `retries`, those faults keep the existing `failed` / `no-result` route.',
    '',
    'An input is satisfied by a launch argument (`--card`) or by an output of an earlier step with the same name.',
    '',
    ...KIND_NAMES.flatMap(section),
  ].join('\n')
}
