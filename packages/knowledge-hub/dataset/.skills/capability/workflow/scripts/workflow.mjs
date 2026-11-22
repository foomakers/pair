#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const cwd = process.cwd()
const here = dirname(fileURLToPath(import.meta.url))
let dir = here
while (dirname(dir) !== dir && !existsSync(join(dir, 'apps/pair-cli/package.json')))
  dir = dirname(dir)
let packageRequire
if (dirname(dir) !== dir) {
  packageRequire = createRequire(join(dir, 'apps/pair-cli/package.json'))
} else {
  try {
    packageRequire = createRequire(
      realpathSync(execFileSync('which', ['pair-cli'], { encoding: 'utf8' }).trim()),
    )
  } catch {
    packageRequire = require
  }
}
const pkg = packageRequire('@pair/workflows')
const {
  schemas,
  kinds,
  list,
  validate,
  readGateRegistry,
  parseConfiguration,
  checkAgainstEngines,
  addressedSteps,
  settingsFor,
} = pkg
const read = path => readFileSync(path, 'utf8')
const safeRead = path => (existsSync(path) ? read(path) : '')
const project = join(cwd, '.pair/adoption/tech')
let root = here
while (
  dirname(root) !== root &&
  !existsSync(join(root, 'packages/knowledge-hub/dataset/.pair/adoption/tech/workflows'))
)
  root = dirname(root)
const shipped =
  dirname(root) !== root
    ? join(root, 'packages/knowledge-hub/dataset/.pair/adoption/tech')
    : join(
        dirname(packageRequire.resolve('@pair/knowledge-hub/package.json')),
        'dataset/.pair/adoption/tech',
      )
const dirs = ['workflows', 'configurations']
  .flatMap(category => [
    { category, source: 'project', directory: join(project, category) },
    { category, source: 'shipped', directory: join(shipped, category) },
  ])
  .map(item => ({ ...item, files: existsSync(item.directory) ? readdirSync(item.directory) : [] }))
const [command, file, flag, config] = process.argv.slice(2)
try {
  let result
  if (command === 'schema') result = schemas()
  else if (command === 'kinds') result = kinds()
  else if (command === 'list') result = list(dirs)
  else if (command === 'validate' && file && (!flag || (flag === '--config' && config))) {
    const checked = validate(read(file), file, {
      skillExists: name =>
        ['.claude/skills', '.skills'].some(dir => existsSync(join(cwd, dir, name, 'SKILL.md'))),
      gateKeys: Object.keys(readGateRegistry(safeRead(join(project, 'way-of-working.md')))),
      launchInputs: ['card'],
      isSafeText: text => !/[`\n\r]/.test(text) && !text.includes('$('),
    })
    result = { ...checked }
    if (config && checked.workflow) {
      const parsed = parseConfiguration(read(config), config)
      result.errors = [...result.errors, ...parsed.errors]
      if (parsed.configuration) {
        const facts = {
          known: id => ['claude', 'codex', 'pi', 'opencode'].includes(id),
          installed: id => {
            try {
              execFileSync('which', [id], { stdio: 'ignore' })
              return true
            } catch {
              return false
            }
          },
          models: () => undefined,
          supportsEffort: id => id === 'claude' || id === 'codex',
        }
        const steps = addressedSteps(checked.workflow)
        const extra = checkAgainstEngines(parsed.configuration, {
          file: config,
          facts,
          steps,
          aliases: checked.workflow.aliases,
        })
        result.errors = [...result.errors, ...extra.errors]
        result.warnings = [...result.warnings, ...extra.warnings]
        result.resolved = steps.map(step => ({
          id: step.id,
          skill: step.skill ?? kinds()[step.kind]?.defaultSkill,
          ...settingsFor(parsed.configuration, step, checked.workflow.aliases),
        }))
      }
    }
    if (result.errors.length) process.exitCode = 1
  } else
    throw new Error(
      'usage: workflow.mjs schema|kinds|list|validate <workflow> [--config <configuration>]',
    )
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
