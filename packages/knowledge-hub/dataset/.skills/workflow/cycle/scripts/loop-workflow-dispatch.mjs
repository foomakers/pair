import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const optionsToArgs = {
  '--root': 'root',
  '--filter': 'filter',
  '--assignee': 'assignee',
  '--status': 'status',
  '--parallel': 'parallel',
  '--state-order': 'stateOrder',
  '--max-iterations': 'maxIterations',
  '--until': 'until',
  '--prepare': 'prepare',
  '--merge': 'merge',
  '--predicate': 'predicateOverride',
  '--iteration': 'startIteration',
}

export function workflowRequest({ policyText, options = {}, overrides, tagProjectionFamily }) {
  if (typeof policyText !== 'string') throw new Error('policyText must be a string')
  const args = { policyText }
  for (const [option, value] of Object.entries(options)) {
    const key = optionsToArgs[option]
    if (!key) throw new Error(`unknown loop option: ${option}`)
    if (value === null) throw new Error(`${option} must not be null`)
    if (value !== undefined) args[key] = value
  }
  if (overrides !== undefined) args.overrides = overrides
  if (tagProjectionFamily !== undefined) args.tagProjectionFamily = tagProjectionFamily
  return { name: 'pair-loop', args }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    process.stdout.write(`${JSON.stringify(workflowRequest(input))}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
