import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { schemas, kinds as describeKinds } from '../../../workflows/src/describe'

const script = resolve(__dirname, '../../dataset/.skills/capability/workflow/scripts/workflow.mjs')
const run = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })

describe('workflow authoring commands (AC-7)', () => {
  it('prints schemas and kind contracts as JSON', () => {
    const schema = JSON.parse(
      execFileSync(process.execPath, [script, 'schema'], { encoding: 'utf8' }),
    )
    expect(schema).toEqual(schemas())
    expect(schema.configuration.properties.defaults).toBeDefined()
    const kinds = JSON.parse(
      execFileSync(process.execPath, [script, 'kinds'], { encoding: 'utf8' }),
    )
    expect(kinds).toEqual(JSON.parse(JSON.stringify(describeKinds())))
  })
  it('lists project files and rejects invalid workflows', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'workflow-cli-'))
    const dir = join(cwd, '.pair/adoption/tech/workflows')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'example.yaml'), 'bad: true\n')
    const found = JSON.parse(run(cwd, 'list').stdout)
    expect(found.workflows).toContainEqual(
      expect.objectContaining({ name: 'quick', source: 'shipped' }),
    )
    expect(found.workflows).toContainEqual(
      expect.objectContaining({ name: 'example', source: 'project' }),
    )
    const result = run(cwd, 'validate', join(dir, 'example.yaml'))
    expect(result.status).not.toBe(0)
    expect(JSON.parse(result.stdout).errors.length).toBeGreaterThan(0)
  })
  it('validates a shipped workflow with configuration and returns resolved settings (AC-5, AC-6)', () => {
    const root = resolve(__dirname, '../../../..')
    const base = resolve(root, 'packages/knowledge-hub/dataset/.pair/adoption/tech')
    const bin = mkdtempSync(join(tmpdir(), 'workflow-engines-'))
    writeFileSync(join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const result = spawnSync(
      process.execPath,
      [
        script,
        'validate',
        join(base, 'workflows/quick.yaml'),
        '--config',
        join(base, 'configurations/codex.yaml'),
      ],
      { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } },
    )
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.errors).toEqual([])
    expect(output.resolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'implement',
          skill: 'pair-process-implement',
          engine: 'codex',
        }),
      ]),
    )
  })
})
