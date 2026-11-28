import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runCommandMetadata } from './metadata'
import { ENGINE_IDS } from './engines'

/**
 * US-487 review r0-6 / r0-7 — the operator-facing text says what the shipped command does.
 *
 * r0-7: `--help` (metadata) and the CLI reference name every engine in the engine map and every
 * `run` flag commander registers, document the `engine.bin` / `engine.model` keys, and no longer
 * claim that an unmapped card changes nothing. r0-6: the KB automation slice (source and dataset
 * mirror) describes the readiness fallback instead of "an unmapped card never runs".
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')
const COMMANDS = 'apps/website/content/docs/reference/cli/commands.mdx'
const CONFIGURATION = 'apps/website/content/docs/reference/configuration.mdx'
const KB = '.pair/knowledge/guidelines/collaboration/automation'
const DATASET = `packages/knowledge-hub/dataset/${KB}`

/** The `## run` section of the CLI reference, up to the next level-2 heading. */
function runSection(): string {
  const doc = read(COMMANDS)
  const start = doc.indexOf('\n## run\n')
  const end = doc.indexOf('\n## ', start + 1)
  return doc.slice(start, end)
}

describe('r0-7: --help and the CLI reference match the shipped run command', () => {
  it('R7-W1: --help names every engine in the engine map', () => {
    const engine = runCommandMetadata.options.find(o => o.flags.startsWith('--engine'))!
    for (const id of ENGINE_IDS) expect(engine.description).toContain(id)
  })

  it('R7-W2: the CLI reference documents every registered run flag', () => {
    const section = runSection()
    for (const option of runCommandMetadata.options) {
      const flag = option.flags.split(/[\s,]/)[0]!
      expect(section, flag).toContain(`\`${flag}`)
    }
  })

  it('R7-W3: the CLI reference names every engine and drops the "nothing changes" claim', () => {
    const section = runSection()
    for (const id of ENGINE_IDS) expect(section, id).toContain(`\`${id}\``)
    expect(section).not.toMatch(
      /no project that had already configured tag dispatch sees any change/,
    )
  })

  it('R7-W4: the configuration reference documents engine.bin and engine.model and every engine id', () => {
    const doc = read(CONFIGURATION)
    const section = doc.slice(doc.indexOf('## Execution Engine'))
    expect(section).toMatch(/`bin`/)
    expect(section).toMatch(/`model`/)
    for (const id of ENGINE_IDS) expect(section, id).toContain(`\`${id}\``)
  })
})

describe('r0-6: the KB automation slice describes the readiness fallback', () => {
  for (const root of [KB, DATASET]) {
    it(`R6-W1 (${root.startsWith('packages') ? 'dataset' : 'source'}): automation-policy.md states the fallback, not "never runs"`, () => {
      const doc = read(`${root}/automation-policy.md`)
      expect(doc).not.toMatch(/A card carrying \*\*no mapped tag never runs\*\*/)
      expect(doc).toMatch(/`pair-cli run --card` on an unmapped card/)
      expect(doc).toMatch(/Unattended runs never start a preparation skill/)
      expect(doc).toMatch(/State Mapping/)
    })

    it(`R6-W2 (${root.startsWith('packages') ? 'dataset' : 'source'}): github-automation.md names what the adapter's --autonomous run does next`, () => {
      const doc = read(`${root}/github-automation.md`)
      expect(doc).toMatch(/card-readiness fallback/)
      expect(doc).toMatch(/enters the delivery cycle/)
    })
  }
})
