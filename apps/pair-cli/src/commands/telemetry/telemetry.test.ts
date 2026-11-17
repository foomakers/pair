import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { handleTelemetryCommand } from './handler'
import { parseTelemetryCommand } from './parser'
import { telemetryFile } from '../run/telemetry'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
const project = (enabled: boolean) => {
  const root = mkdtempSync(join(tmpdir(), 'tc-'))
  dirs.push(root)
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(
    join(root, '.pair/adoption/tech/automation.md'),
    `## Telemetry\n\n- enabled: ${enabled}\n`,
  )
  return root
}
const stepArgs = (root: string) =>
  parseTelemetryCommand(
    { root, card: '594', step: 'implement', engine: 'claude', start: '1000', end: '2000' },
    ['step'],
  )

it('AC-1: step writes a manual pair when telemetry is enabled', async () => {
  const root = project(true)
  expect(await handleTelemetryCommand(stepArgs(root), undefined as never)).toBe(0)
  const records = readFileSync(telemetryFile(root), 'utf8').trim().split('\n')
  expect(records.map(l => JSON.parse(l).source)).toEqual(['manual', 'manual'])
})

it('AC-4: same switch as the driver; off writes nothing', async () => {
  const root = project(false)
  await handleTelemetryCommand(stepArgs(root), undefined as never)
  expect(existsSync(telemetryFile(root))).toBe(false)
})

it('rejects a missing mode and bad times', () => {
  expect(() => parseTelemetryCommand({ card: '1' }, [])).toThrow(/step.*card/)
  expect(() =>
    parseTelemetryCommand({ card: '1', step: 's', engine: 'e', start: 'x', end: '1' }, ['step']),
  ).toThrow(/--start/)
})
