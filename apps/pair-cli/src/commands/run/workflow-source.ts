import { createHash } from 'crypto'
import { join, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import {
  formatError,
  readGateRegistry,
  readGateTargets,
  validate,
  type Validation,
  type WorkflowSkillContext,
} from '@pair/workflows'
import type { Config } from '#registry'
import { getKnowledgeHubDatasetPath } from '#config/kb-resolver'
import { isSafePromptText } from './prompt-safety'
import { createSkillProbe, workflowDefaultSkill, workflowSkillProbe } from './skill-probe'
import { isEngineId, type EngineId } from './engines'
import { locateCycleScripts } from './cycle-scripts'
import { canCommentOnCard } from './workflow-facts'

const WORKFLOWS_DIR = '.pair/adoption/tech/workflows'
const PORTABLE_QUICK =
  '.pair/knowledge/guidelines/collaboration/automation/workflow-examples/quick.yaml'
export const WAY_OF_WORKING = '.pair/adoption/tech/way-of-working.md'

export interface Located {
  readonly file: string
  readonly text: string
}

/** A path if the argument is an existing file; else the adoption workflow; else the knowledge-base default. */
export function locateWorkflow(
  fs: FileSystemService,
  at: { readonly cwd: string; readonly main: string },
  name: string,
): Located {
  const adopted = join(at.main, WORKFLOWS_DIR, `${name}.yaml`)
  const candidates = [resolve(at.cwd, name), adopted]
  try {
    const dataset = getKnowledgeHubDatasetPath(fs)
    // The portable Quick fallback works without project gate targets.
    if (name === 'quick') candidates.push(join(dataset, PORTABLE_QUICK))
    candidates.push(join(dataset, WORKFLOWS_DIR, `${name}.yaml`))
  } catch {
    // no knowledge base beside this CLI: the two project locations are the only candidates
  }
  const file = candidates.find(path => fs.existsSync(path) && fs.statSync(path).isFile())
  if (file === undefined)
    throw new Error(
      `workflow-not-found: '${name}' is neither a workflow file nor a workflow name — ` +
        `looked for ${candidates.join(', ')}. Pass the path of a file, or add ${adopted}.`,
    )
  return { file, text: fs.readFileSync(file) }
}

function availableWorkflows(fs: FileSystemService, main: string): string[] {
  const dirs = [join(main, WORKFLOWS_DIR)]
  try {
    dirs.push(join(getKnowledgeHubDatasetPath(fs), WORKFLOWS_DIR))
  } catch {
    // No knowledge base beside this CLI.
  }
  return dirs.flatMap(dir =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter(entry => entry.isFile() && entry.name.endsWith('.yaml'))
          .map(entry => entry.name.slice(0, -5))
      : [],
  )
}

export function checkWorkflow(
  fs: FileSystemService,
  project: Config,
  {
    cwd,
    main,
    sources,
    engine,
  }: { cwd: string; main: string; sources?: Record<string, string>; engine?: EngineId },
  source: { text: string; file: string },
) {
  const registry = join(main, WAY_OF_WORKING)
  const registryText = fs.existsSync(registry) ? fs.readFileSync(registry) : ''
  return validate(source.text, source.file, {
    skillExists: createSkillProbe(fs, project, cwd, true, engine),
    deferSkillProbe: true,
    gateKeys: Object.keys(readGateRegistry(registryText)),
    gateTargets: Object.keys(readGateTargets(registryText)),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
    canCommentOnCard: () =>
      canCommentOnCard(() => locateCycleScripts(fs, project, cwd).scriptsDir, cwd),
    availableWorkflows: availableWorkflows(fs, main),
    resolveWorkflow: name => {
      try {
        const included = locateWorkflow(fs, { cwd, main }, name)
        if (sources !== undefined)
          sources[included.file] = createHash('sha256').update(included.text).digest('hex')
        return included
      } catch {
        return undefined
      }
    },
  })
}

export function workflowSkillContext(
  fs: FileSystemService,
  project: Config,
  cwd: string,
  at: Pick<WorkflowSkillContext, 'configuration' | 'engine'>,
): WorkflowSkillContext {
  const probes = new Map<EngineId, ReturnType<typeof workflowSkillProbe>>()
  return {
    ...at,
    isSafeText: isSafePromptText,
    defaultSkill: workflowDefaultSkill(fs, project, cwd),
    skillExists(name, engine) {
      if (!isEngineId(engine)) return false
      const probe = probes.get(engine) ?? workflowSkillProbe(fs, project, cwd, engine)
      probes.set(engine, probe)
      return probe(name)
    },
  }
}

export function reportValidation(checked: Pick<Validation, 'errors' | 'warnings'>): void {
  checked.warnings.forEach(warning => console.log(`  Warning: ${formatError(warning)}`))
  if (checked.errors.length === 0) return
  checked.errors.forEach(error => console.error(`  ${formatError(error)}`))
  console.error(`  Refused: ${String(checked.errors.length)} error(s); nothing was launched.`)
}
