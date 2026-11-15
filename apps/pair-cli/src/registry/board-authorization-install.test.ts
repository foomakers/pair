import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { extractRegistries } from './resolver'
import { buildCopyOptions, doCopyAndUpdateLinks } from './operations'

// #642 r1-g2-gap1/gap2: development evidence never installs; runtime siblings still do.
const root = join(__dirname, '..', '..', '..', '..')
const dataset = join(root, 'packages/knowledge-hub/dataset/.workflows')
const registry = extractRegistries(
  JSON.parse(readFileSync(join(root, 'apps/pair-cli/config.json'), 'utf8')),
)['workflows']!
const rows = [
  ['r1-g2-gap1-install', 'pair-contracts/board-authorization.test.mjs', false],
  ['r1-g2-gap2-install', 'pair-contracts/board-authorization.rows.json', false],
  ['r1-g2-gap-existing-exclusion', 'pair-contracts/board-sync.test.mjs', false],
  ['r1-g2-gap-runtime-sibling', 'pair-contracts/.gitignore', true],
  ['r1-g2-gap-runtime-engine', 'pair-implement-batch.js', true],
] as const

// Real dataset bytes and production copy pipeline; no workflow or engine executes.
describe('board authorization evidence install boundary', () => {
  let temp: string
  let target: string

  beforeAll(async () => {
    temp = mkdtempSync(join(tmpdir(), 'pair-board-install-'))
    const source = join(temp, registry.source)
    target = resolve(temp, 'adopter', registry.targets[0]!.path)
    mkdirSync(dirname(target), { recursive: true })
    mkdirSync(join(source, 'pair-contracts'), { recursive: true })
    for (const [, file] of rows) copyFileSync(join(dataset, file), join(source, file))
    await doCopyAndUpdateLinks(fileSystemService, {
      source,
      target,
      datasetRoot: temp,
      options: buildCopyOptions(registry),
    })
  })

  afterAll(() => {
    if (temp) rmSync(temp, { recursive: true, force: true })
  })

  it.each(rows)('%s', (_id, file, installs) => {
    if (installs) {
      expect(readFileSync(join(target, file)).equals(readFileSync(join(dataset, file)))).toBe(true)
    } else {
      expect.soft(registry.exclude).toContain(file)
      expect(existsSync(join(target, file))).toBe(false)
    }
  })
})
