import { basename, extname, join, resolve } from 'node:path'
import {
  checkWorkflowTiers,
  hasConfigurationTiers,
  isConfigurationPath,
  parseConfiguration,
  selectConfiguration,
  settingsFor,
  type Configuration,
  type ResolvedSettings,
  type WorkflowsConfig,
} from '../configuration'
import { list } from '../describe'
import { hashOf } from '../engine'
import { expandedWorkflowSource } from '../expand'
import { addressedSteps, formatError, type Step, type Workflow } from '../grammar'
import { interactiveOf, kindByName, readGateRegistry, readGateTargets } from '../kinds'
import { validate } from '../validate'
import { canCommentOnCard } from '../worktree/session'
import { isFile, projectConfig, readOptional, readText, yamlFiles } from './session-files'

const TECH = '.pair/adoption/tech'
const PORTABLE_QUICK =
  '.pair/knowledge/guidelines/collaboration/automation/workflow-examples/quick.yaml'

export const isSafeText = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 200 &&
  !value.includes('`') &&
  !value.includes('$(') &&
  !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)

export interface Project {
  readonly cwd: string
  readonly main: string
  readonly scriptDir: string
}

const CATEGORIES = ['workflows', 'configurations'] as const

function directories(project: Project, category: (typeof CATEGORIES)[number]) {
  const dataset = resolve(project.scriptDir, '../../../..')
  return [
    { category, source: 'project' as const, directory: join(project.main, TECH, category) },
    // A bundle inside the dataset can read shipped defaults. An installed bundle must not borrow
    // adoption files from its own checkout when invoked from an isolated staging directory.
    ...(dataset !== project.main &&
    project.scriptDir === join(dataset, '.skills/capability/workflow/scripts')
      ? [{ category, source: 'shipped' as const, directory: join(dataset, TECH, category) }]
      : []),
  ]
}

export const workflowList = (project: Project) =>
  list(
    CATEGORIES.flatMap(category => directories(project, category)).map(entry => ({
      ...entry,
      files: yamlFiles(entry.directory),
    })),
  )

function namedCandidates(project: Project, category: (typeof CATEGORIES)[number], name: string) {
  return directories(project, category).flatMap(({ directory }) => [
    join(directory, `${name}.yaml`),
    join(directory, `${name}.yml`),
  ])
}

export function cycleScripts(project: Project): string {
  const candidates = [
    resolve(project.scriptDir, '../../pair-workflow-cycle/scripts'),
    resolve(project.scriptDir, '../../../workflow/cycle/scripts'),
    ...['.claude', '.agents'].map(root =>
      join(project.main, root, 'skills/pair-workflow-cycle/scripts'),
    ),
  ]
  const scripts = candidates.find(dir =>
    ['cycle-state.mjs', 'cycle-dispatch.mjs'].every(file => isFile(join(dir, file))),
  )
  if (scripts === undefined) throw new Error('skill-missing: install pair-workflow-cycle')
  return scripts
}

export function controlStateScript(project: Project): string {
  const candidates = [
    ...['.claude', '.agents', '.opencode', '.github', '.cursor', '.agent', '.windsurf'].map(host =>
      join(project.main, host, 'skills/pair-next/control-state.mjs'),
    ),
    resolve(project.scriptDir, '../../../next/control-state.mjs'),
  ]
  const script = candidates.find(isFile)
  if (script === undefined)
    throw new Error('skill-missing: install pair-next with control-state.mjs')
  return script
}

function skillExists(project: Project, skill: string): boolean {
  const [, category, name] = /^pair-(capability|process|workflow)-(.+)$/.exec(skill) ?? []
  return (
    ['.claude', '.agents', '.opencode', '.github', '.cursor', '.agent', '.windsurf'].some(host =>
      isFile(join(project.cwd, host, 'skills', skill, 'SKILL.md')),
    ) ||
    (category !== undefined &&
      name !== undefined &&
      isFile(join(project.cwd, '.skills', category, name, 'SKILL.md')))
  )
}

export const readAdoption = ({ main }: Project) =>
  readOptional(join(main, TECH, 'way-of-working.md')) ?? ''

export const workflowName = (source: string) => basename(source, extname(source))

function readWorkflowSource(project: Project, name: string) {
  const candidates = namedCandidates(project, 'workflows', name)
  if (name === 'quick') {
    const dataset = resolve(project.scriptDir, '../../../..')
    candidates.splice(2, 0, join(project.main, PORTABLE_QUICK))
    if (project.scriptDir === join(dataset, '.skills/capability/workflow/scripts'))
      candidates.splice(3, 0, join(dataset, PORTABLE_QUICK))
  }
  const file = [resolve(project.cwd, name), ...candidates].find(isFile)
  return file === undefined ? undefined : { file, text: readText(file) }
}

export function workflowDefinition(project: Project, name: string) {
  const digests: Record<string, string> = {}
  const locate = (source: string) => {
    const located = readWorkflowSource(project, source)
    if (located !== undefined) digests[located.file] = hashOf(located.text).slice('sha256:'.length)
    return located
  }
  const source = locate(name)
  if (source === undefined) throw new Error(`workflow-not-found: ${name}`)
  const adoption = readAdoption(project)
  const checked = validate(source.text, source.file, {
    skillExists: skill => skillExists(project, skill),
    gateKeys: Object.keys(readGateRegistry(adoption)),
    gateTargets: Object.keys(readGateTargets(adoption)),
    launchInputs: ['card'],
    isSafeText,
    canCommentOnCard: () => canCommentOnCard(() => cycleScripts(project), project.main),
    availableWorkflows: directories(project, 'workflows').flatMap(({ directory }) =>
      yamlFiles(directory).map(workflowName),
    ),
    resolveWorkflow: locate,
  })
  if (checked.workflow === undefined)
    throw new Error(`workflow-invalid: ${checked.errors.map(formatError).join('\n')}`)
  const workflow = checked.workflow
  return {
    workflow,
    source: expandedWorkflowSource(workflow, source),
    warnings: checked.warnings.map(formatError),
    digests,
  }
}

export function workflowConfiguration(
  project: Project,
  input: { workflow: string; engine: string; flag?: string | undefined; labels: readonly string[] },
  config = projectConfig(project.cwd) ?? projectConfig(project.main),
) {
  const { flag, workflow, labels } = input
  const workflows = config?.['workflows'] as WorkflowsConfig | undefined
  const locate = (name: string) =>
    (isConfigurationPath(name)
      ? [resolve(project.cwd, name)]
      : namedCandidates(project, 'configurations', name)
    ).find(isFile)
  const tierErrors = checkWorkflowTiers(workflows, name => locate(name) !== undefined)
  if (tierErrors.length) throw new Error(tierErrors.join('\n'))
  const choose = selectConfiguration({ ...input, workflows })
  if (choose === undefined) return undefined
  const file = locate(choose.name)
  if (file === undefined) throw new Error(`configuration-not-found: ${choose.name} (${choose.via})`)
  const parsed = parseConfiguration(readText(file), file)
  if (parsed.configuration === undefined)
    throw new Error(`configuration-invalid: ${parsed.errors.map(formatError).join('\n')}`)
  return {
    configuration: parsed.configuration,
    file,
    ...(flag === undefined && hasConfigurationTiers(workflows, workflow) && { cardLabels: labels }),
  }
}

export function effectiveSettings(
  configuration: Configuration | undefined,
  workflow: Workflow,
  step: Step,
  engine: string,
): Partial<ResolvedSettings> & { engine: string } {
  return configuration === undefined
    ? { engine }
    : settingsFor(configuration, step, workflow.aliases)
}

export function workflowSummary(
  workflow: Workflow,
  configuration: Configuration | undefined,
  engine: string,
) {
  return {
    workflow: workflow.name,
    configuration: configuration?.name,
    steps: addressedSteps(workflow).flatMap(step =>
      step.kind === 'loop'
        ? []
        : [
            {
              id: step.id,
              kind: step.kind,
              skill: step.skill ?? kindByName[step.kind].defaultSkill,
              interactive: interactiveOf(step),
              settings: effectiveSettings(configuration, workflow, step, engine),
            },
          ],
    ),
  }
}
