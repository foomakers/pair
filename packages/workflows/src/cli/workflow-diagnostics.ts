import type { Configuration } from '../configuration'
import { addressedSteps, formatError, type Workflow } from '../grammar'
import { resumeEngineWarnings } from '../validate'
import { loadSessionProjectConfig } from './session-files'
import {
  checkWorkflowConfiguration,
  effectiveSettings,
  workflowConfiguration,
  workflowDefinition,
  workflowSummary,
  type Project,
} from './session-project'

function declaredEngine(config: Record<string, unknown>): string {
  const run = config['run'] as { defaults?: { engine?: unknown } } | undefined
  const engine = config['engine'] as { id?: unknown } | undefined
  const declared = run?.defaults?.engine ?? engine?.id
  return typeof declared === 'string' ? declared : 'claude'
}

export function workflowResumeWarnings(
  workflow: Workflow,
  configuration: Configuration | undefined,
  engine: string,
): string[] {
  const engines = new Map(
    addressedSteps(workflow).map(step => [
      step.id,
      effectiveSettings(configuration, workflow, step, engine).engine,
    ]),
  )
  return resumeEngineWarnings(workflow, {
    engineFor: id => engines.get(id),
    // The OpenCode workflow adapter cannot distinguish a missing session from a new one.
    supports: id => (id === 'opencode' ? false : undefined),
  }).map(formatError)
}

export function validateWorkflow(
  project: Project,
  name: string,
  { engine: engineFlag, config: flag }: { engine?: string; config?: string },
) {
  const { workflow, warnings } = workflowDefinition(project, name)
  const projectSettings = loadSessionProjectConfig(project.cwd) ?? {}
  const engine = engineFlag ?? declaredEngine(projectSettings)
  const selected = workflowConfiguration(
    project,
    { workflow: workflow.name, engine, flag, labels: [] },
    projectSettings,
  )
  const configWarnings = checkWorkflowConfiguration(workflow, selected, engineFlag)
  const configuration = selected?.configuration
  return {
    file: workflow.file,
    ...workflowSummary(project, workflow, configuration, engine),
    warnings: [
      ...warnings,
      ...configWarnings,
      ...workflowResumeWarnings(workflow, configuration, engine),
    ],
  }
}
