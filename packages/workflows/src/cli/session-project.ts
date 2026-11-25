import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  checkWorkflowTiers,
  configurationText,
  hasConfigurationTiers,
  isConfigurationPath,
  parseConfiguration,
  selectConfiguration,
  type WorkflowsConfig,
} from '../configuration'
import { hashOf } from '../engine'
import { expandedWorkflowSource } from '../expand'
import { formatError } from '../grammar'
import { readGateRegistry, readGateTargets } from '../kinds'
import { validate } from '../validate'
import { isFile, projectConfig, readOptional, readText, yamlNames } from './session-files'

const TECH = '.pair/adoption/tech'

export const isSafeText = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 200 &&
  !value.includes('`') &&
  !value.includes('$(') &&
  !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)

interface Project {
  readonly cwd: string
  readonly main: string
  readonly scriptDir: string
}

const roots = (project: Project) => [project.main, resolve(project.scriptDir, '../../../..')]

function directories(project: Project, category: 'workflows' | 'configurations') {
  return [...new Set(roots(project))].map(root => join(root, TECH, category))
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

function skillExists(project: Project, skill: string): boolean {
  const adjacent = join(dirname(dirname(project.scriptDir)), skill, 'SKILL.md')
  if (isFile(adjacent)) return true
  const [, category, name] = /^pair-(capability|process|workflow)-(.+)$/.exec(skill) ?? []
  return roots(project).some(
    root =>
      ['.claude', '.agents', '.opencode'].some(host =>
        isFile(join(root, host, 'skills', skill, 'SKILL.md')),
      ) ||
      (category !== undefined &&
        name !== undefined &&
        isFile(join(root, '.skills', category, name, 'SKILL.md'))),
  )
}

export const readAdoption = ({ main }: Project) =>
  readOptional(join(main, TECH, 'way-of-working.md')) ?? ''

export const workflowName = (source: string) => basename(source, extname(source))

function readWorkflowSource(project: Project, name: string, dirs: string[]) {
  const file = [
    resolve(project.cwd, name),
    ...dirs.flatMap(dir => [join(dir, `${name}.yaml`), join(dir, `${name}.yml`)]),
  ].find(isFile)
  return file === undefined ? undefined : { file, text: readText(file) }
}

export function workflowDefinition(project: Project, name: string) {
  const dirs = directories(project, 'workflows')
  const digests: Record<string, string> = {}
  const locate = (source: string) => {
    const located = readWorkflowSource(project, source, dirs)
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
    availableWorkflows: dirs.flatMap(yamlNames),
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
) {
  const { flag, workflow, labels } = input
  const config = projectConfig(project.cwd) ?? projectConfig(project.main)
  const workflows = config?.['workflows'] as WorkflowsConfig | undefined
  const dirs = directories(project, 'configurations')
  const locate = (name: string) =>
    (isConfigurationPath(name)
      ? [resolve(project.cwd, name)]
      : dirs.flatMap(dir => [join(dir, `${name}.yaml`), join(dir, `${name}.yml`)])
    ).find(isFile)
  const tierErrors = checkWorkflowTiers(workflows, name => locate(name) !== undefined)
  if (tierErrors.length) throw new Error(tierErrors.join('\n'))
  const choose = selectConfiguration({ ...input, workflows })
  if (choose === undefined) return {}
  const file = locate(choose.name)
  if (file === undefined) throw new Error(`configuration-not-found: ${choose.name} (${choose.via})`)
  const parsed = parseConfiguration(readText(file), file)
  if (parsed.configuration === undefined)
    throw new Error(`configuration-invalid: ${parsed.errors.map(formatError).join('\n')}`)
  return {
    configuration: { text: configurationText(parsed.configuration) },
    ...(flag === undefined && hasConfigurationTiers(workflows, workflow) && { cardLabels: labels }),
  }
}
