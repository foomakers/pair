import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from './loader'
import { readFileSync } from 'fs'
import { join } from 'path'

const REAL_CONFIG = readFileSync(join(__dirname, '../../config.json'), 'utf8')

const load = (project: string, projectConfigOnly = true) =>
  loadConfigWithOverrides(
    new InMemoryFileSystemService(
      { '/opt/pair-cli/config.json': REAL_CONFIG, '/consumer/pair.config.json': project },
      '/opt/pair-cli',
      '/consumer',
    ),
    { projectRoot: '/consumer', projectConfigOnly },
  )

describe('US-552 r0-1 project pair.config.json must be an object', () => {
  it.each(['[1]', '"x"', '1'])('witness: %s throws naming the file', raw => {
    expect(() => load(raw)).toThrow(/\/consumer\/pair\.config\.json/)
  })

  it('control: null already throws', () => {
    expect(() => load('null')).toThrow(/\/consumer\/pair\.config\.json/)
  })

  it('control: an object config loads', () => {
    expect(load('{"skipRegistries":["agents"]}').skipRegistries).toEqual(['agents'])
  })

  it('control: non-object tolerated when not projectConfigOnly', () => {
    expect(() => load('[1]', false)).not.toThrow()
  })
})

describe('#568 B5 the error prefix is printed once', () => {
  it.each(['[1]', '{"skipRegistries":3}', '{bad'])('%s: no "Error:" inside the message', raw => {
    expect(() => load(raw)).toThrow(/Failed to load \/consumer\/pair\.config\.json: (?!Error)/)
  })
})
