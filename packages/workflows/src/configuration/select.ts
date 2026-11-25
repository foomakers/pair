type ConfigurationChoice = string | Readonly<Record<string, string>>

/** `pair.config.json` → `workflows`: per-workflow configurations and card label overrides. */
export type WorkflowsConfig = Readonly<
  Record<
    string,
    {
      readonly configuration?: ConfigurationChoice
      readonly tiers?: Readonly<Record<string, ConfigurationChoice>>
    }
  >
>

export interface Selection {
  /** A configuration name, or a file path when `--config` gave one. */
  readonly name: string
  /** Where the choice came from, for the printed line. */
  readonly via: string
}

export interface SelectionInput {
  /** `--config`. */
  readonly flag?: string | undefined
  /** `--engine`, when passed. */
  readonly engineFlag?: string | undefined
  /** The engine the run resolved to: picks the entry of a map when no flag was passed. */
  readonly engine: string
  readonly workflows?: WorkflowsConfig | undefined
  readonly workflow: string
  readonly labels?: readonly string[] | undefined
}

function configurationTiers(workflows: WorkflowsConfig | undefined, workflow: string) {
  const key = workflows && Object.hasOwn(workflows, workflow) ? workflow : 'default'
  return { key, tiers: workflows?.[key]?.tiers ?? {} }
}

export function hasConfigurationTiers(workflows: WorkflowsConfig | undefined, workflow: string) {
  return Object.keys(configurationTiers(workflows, workflow).tiers).length > 0
}

function matchingTier({ workflows, workflow, labels }: SelectionInput) {
  if (!labels?.length) return undefined
  const { key, tiers } = configurationTiers(workflows, workflow)
  const tier = Object.entries(tiers).find(([label]) => labels.includes(label))
  if (!tier) return undefined
  const [label, choice] = tier
  return { choice, via: `pair.config.json workflows.${key}.tiers.${label}` }
}

function resolveChoice(
  choice: ConfigurationChoice,
  engine: string,
  via: string,
  mapSource = via,
): Selection {
  if (typeof choice === 'string') return { name: choice, via }
  const name = Object.hasOwn(choice, engine) ? choice[engine] : undefined
  if (name === undefined)
    throw new Error(
      `configuration-not-found: ${mapSource} has no entry for engine '${engine}' ` +
        `(it has ${Object.keys(choice).join(', ')}) — add one or pass --config`,
    )
  return { name, via }
}

/** Order: `--config`, matching tier, workflow configuration, default configuration. */
export function selectConfiguration(input: SelectionInput): Selection | undefined {
  if (input.flag !== undefined) return { name: input.flag, via: '--config' }
  const engine = input.engineFlag ?? input.engine
  const tier = matchingTier(input)
  if (tier) return resolveChoice(tier.choice, engine, tier.via)

  for (const key of [input.workflow, 'default']) {
    const choice = input.workflows?.[key]?.configuration
    if (choice === undefined) continue
    const via = `pair.config.json workflows.${key}`
    return resolveChoice(choice, engine, via, `${via}.configuration`)
  }
  return undefined
}

/** A `--config` value is a path when it says so, a name otherwise. */
export const isConfigurationPath = (value: string): boolean => /[\\/]|\.ya?ml$/.test(value)

/** The first candidate that exists: the project's file is listed before the knowledge base's, so it replaces it entirely (design §1). */
export const firstExisting = (
  candidates: readonly string[],
  exists: (path: string) => boolean,
): string | undefined => candidates.find(exists)
