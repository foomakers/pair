import { join, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from '#config'
import { declaredEngine } from '../run/run-context'
import { DEFAULT_ENGINE_ID } from '../run/engines'
import { mainCheckoutOrCwd } from '../run/cycle-wiring'
import { checkWorkflow, locateWorkflow, reportValidation } from '../run/workflow-source'

export interface WorkflowCommandConfig {
  readonly command: 'workflow'
  readonly name: string
}

export const workflowCommandMetadata = {
  name: 'workflow',
  description: 'Validate a workflow by name or file',
  usage: 'pair-cli workflow validate <name-or-file>',
  examples: ['pair-cli workflow validate quick', 'pair-cli workflow validate ./workflow.yaml'],
  options: [
    { flags: '<action>', description: 'validate' },
    { flags: '<name-or-file>', description: 'Adopted workflow name or path to a workflow file' },
  ],
  notes: [
    'Validation reads the workflow without launching it',
    'Warnings do not affect the exit code',
  ],
} as const

export function parseWorkflowCommand(
  _options: unknown,
  [action, name]: readonly string[],
): WorkflowCommandConfig {
  if (action !== 'validate' || !name) {
    throw new Error('Expected pair-cli workflow validate <name-or-file>')
  }
  return { command: 'workflow', name }
}

export async function handleWorkflowCommand(
  { name }: WorkflowCommandConfig,
  fs: FileSystemService,
): Promise<number> {
  const cwd = resolve(fs.currentWorkingDirectory())
  const main = mainCheckoutOrCwd(cwd)
  const project = loadConfigWithOverrides(fs, {
    projectRoot: cwd,
    skipBaseConfig: !fs.existsSync(join(fs.rootModuleDirectory(), 'config.json')),
  }).config
  const source = locateWorkflow(fs, { cwd, main }, name)
  const checked = checkWorkflow(
    fs,
    project,
    { cwd, main, engine: declaredEngine(project) ?? DEFAULT_ENGINE_ID },
    source,
  )
  reportValidation(checked)
  if (checked.workflow === undefined) return 1
  console.log(`Valid workflow: ${source.file}`)
  return 0
}
