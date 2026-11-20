import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it.each(['readiness', 'parallel'] as const)(
  '#601 AC3: SIGINT during %s host read stops descendants',
  async route => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-early-signal-'))
    const scriptDir = join(root, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scriptDir, { recursive: true })
    const marker = join(root, 'descendant.pid')
    const leader = join(root, 'leader.pid')
    const desc = `require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
    writeFileSync(
      join(scriptDir, 'cycle-state.mjs'),
      `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(leader)},String(process.pid));spawn(process.execPath,['-e',${JSON.stringify(desc)}],{stdio:'ignore'});setInterval(()=>{},1000)\n`,
    )
    const projectPolicy =
      route === 'parallel'
        ? '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n2\n'
        : '# Automation\n'
    const files = {
      [join(root, 'config.json')]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }),
      [join(root, '.pair/adoption/tech/automation.md')]: projectPolicy,
      [join(root, '.pair/adoption/tech/way-of-working.md')]:
        '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Refined | Ready |\n',
      [join(root, '.claude/skills/pair-workflow-cycle/SKILL.md')]: '',
      [join(scriptDir, 'cycle-state.mjs')]: '',
      [join(scriptDir, 'cycle-dispatch.mjs')]: '',
      '/bin/claude': '',
    }
    const options =
      route === 'readiness'
        ? { card: '493', cardTags: '', cwd: root }
        : { root: '605', parallel: '2', autonomous: true, cwd: root }
    const candidate = {
      id: '7',
      title: '',
      branch: '',
      tier: 'risk:green',
      labels: ['risk:green'],
      macrostate: 'Ready',
      mutexResources: [],
      prerequisites: [],
    }
    const runner = `
const {InMemoryFileSystemService}=require('@pair/content-ops')
const {handleRunCommand}=require(${JSON.stringify(resolve(process.cwd(), 'dist/commands/run/handler.js'))})
const {parseRunCommand}=require(${JSON.stringify(resolve(process.cwd(), 'dist/commands/run/parser.js'))})
const fs=new InMemoryFileSystemService(${JSON.stringify(files)},${JSON.stringify(root)},${JSON.stringify(root)})
const deps={appendAudit:()=>{},selectCandidates:async()=>[${JSON.stringify(candidate)}],readPrereqState:()=>({blocked:false,prerequisites:[]})}
handleRunCommand(parseRunCommand(${JSON.stringify(options)}),fs,deps).then(code=>process.exit(code)).catch(e=>{console.error(e);process.exit(2)})
`
    const child = spawn(process.execPath, ['-e', runner], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
    })
    child.stderr.on('data', chunk => {
      output += String(chunk)
    })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    )
    try {
      const ready = await new Promise<boolean>(resolve => {
        const watcher = watch(root, () => {
          if (existsSync(marker)) {
            watcher.close()
            clearTimeout(timer)
            resolve(true)
          }
        })
        const timer = setTimeout(() => {
          watcher.close()
          resolve(false)
        }, 8000)
        if (existsSync(marker)) {
          watcher.close()
          clearTimeout(timer)
          resolve(true)
        }
      })
      expect(ready, output).toBe(true)
      const pid = Number(readFileSync(marker, 'utf8'))
      child.kill('SIGINT')
      const status = await Promise.race([
        exited,
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 3000)),
      ])
      expect(status, output).toEqual({ code: 130, signal: null })
      expect(() => process.kill(pid, 0)).toThrow()
    } finally {
      if (existsSync(leader)) {
        try {
          process.kill(-Number(readFileSync(leader, 'utf8')), 'SIGKILL')
        } catch {
          /* exited */
        }
      }
      if (child.exitCode === null) child.kill('SIGKILL')
      rmSync(root, { recursive: true, force: true })
    }
  },
  20000,
)
