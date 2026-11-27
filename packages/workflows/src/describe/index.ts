import { workflowSchemaV1 } from '../grammar'
import { configurationSchemaV1 } from '../configuration'
import { kindByName } from '../kinds'

/** The same schemas used to validate workflow and configuration files. */
export const schemas = () => ({ workflow: workflowSchemaV1, configuration: configurationSchemaV1 })

/** Serializable contracts from the validating kinds. */
export const kinds = () =>
  Object.fromEntries(
    Object.entries(kindByName).map(([name, kind]) => [
      name,
      {
        name: kind.name,
        ...(kind.defaultSkill === undefined ? {} : { defaultSkill: kind.defaultSkill }),
        defaultInteractive: kind.defaultInteractive,
        defaultContext: kind.defaultContext,
        ...(kind.host === undefined ? {} : { host: kind.host }),
        inputs: kind.inputs,
        outputs: kind.outputs,
        with: kind.with,
        returns: kind.returns,
        ...(kind.rule === undefined ? {} : { rule: kind.rule.text }),
      },
    ]),
  )

/** Files supplied by the host, grouped by category and source. */
export function list(
  directories: readonly {
    readonly category: 'workflows' | 'configurations'
    readonly source: 'project' | 'shipped'
    readonly directory: string
    readonly files: readonly string[]
  }[],
) {
  const entries = (category: 'workflows' | 'configurations') =>
    directories
      .filter(one => one.category === category)
      .flatMap(({ directory, files, source }) =>
        files
          .filter(file => /\.ya?ml$/.test(file))
          .slice()
          .sort()
          .map(file => ({
            name: file.replace(/\.ya?ml$/, ''),
            file: `${directory}/${file}`,
            source,
          })),
      )
  return { workflows: entries('workflows'), configurations: entries('configurations') }
}
