import { execFile, execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)
const repo = resolve(process.cwd(), '../..')
const cli = resolve(process.cwd(), 'dist/cli.js')

it.each(['labels', 'readiness'] as const)(
  '#601 r0-2: CLI %s park survives host recovery',
  async route => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-entry-cli-'))
    const main = join(root, 'main')
    const bin = join(root, 'bin')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      PAIR_GH_BIN: join(bin, 'gh'),
    }
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: main, env, stdio: 'ignore' })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    cpSync(
      join(repo, '.claude/skills/pair-workflow-cycle'),
      join(main, '.claude/skills/pair-workflow-cycle'),
      { recursive: true },
    )
    cpSync(join(repo, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    writeFileSync(
      join(main, '.pair/adoption/tech/way-of-working.md'),
      'GitHub Projects\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Refined | Ready |\n',
    )
    const down = join(root, 'host-down')
    const retryOnce = join(root, 'host-retry-once')
    const engine = join(root, 'engine-started')
    writeFileSync(down, '')
    writeFileSync(
      join(bin, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2)
if (args[0] === 'repo' && args[1] === 'view') { process.stdout.write('fixture/repo'); process.exit(0) }
if (fs.existsSync(${JSON.stringify(down)})) { process.stderr.write('HTTP 503 Retry-After: 31'); process.exit(1) }
if (fs.existsSync(${JSON.stringify(retryOnce)})) { fs.unlinkSync(${JSON.stringify(retryOnce)}); process.stderr.write('HTTP 503 Retry-After: 0'); process.exit(1) }
const card = { title:'A story', body:'**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] **T-1**: build it\\n', labels:[{name:'risk:green'}], state:'OPEN', projectItems:[{status:{name:'Refined'}}] }
if (args[0] === 'issue' && args[1] === 'view') process.stdout.write(args.includes('-q') ? card.body : JSON.stringify(card))
else if (args[0] === 'api') process.stdout.write('[]')
else process.exit(1)
`,
    )
    writeFileSync(
      join(bin, 'claude'),
      `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(engine)}, 'started');process.kill(process.ppid,'SIGTERM');setInterval(()=>{},1000)\n`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    chmodSync(join(bin, 'claude'), 0o755)
    const args = [
      cli,
      'run',
      '--card',
      '493',
      '--autonomous',
      '--cwd',
      main,
      '--no-color',
      ...(route === 'readiness' ? ['--card-tags', ''] : []),
    ]
    const invoke = async (extra: string[] = []) =>
      await exec(process.execPath, [...args, ...extra], { cwd: main, env, timeout: 25000 })
        .then(r => ({ code: 0, text: r.stdout + r.stderr }))
        .catch((e: { code: number; stdout: string; stderr: string }) => ({
          code: e.code,
          text: e.stdout + e.stderr,
        }))
    try {
      const first = await invoke()
      expect(first.code, first.text).toBe(1)
      expect(first.text).toMatch(/awaiting-human/)
      expect(first.text).toMatch(/resolve:run:host-transient/)
      const runDir = join(main, '.pair/working/runs/story-493/493')
      const recovery = JSON.parse(readFileSync(join(runDir, 'recovery.json'), 'utf8')) as {
        rounds: unknown[]
      }
      expect(recovery.rounds).toHaveLength(1)
      expect(existsSync(join(main, '.pair/working/automation/locks/493'))).toBe(false)
      unlinkSync(down)
      const second = await invoke()
      expect(second.text).not.toMatch(/run-in-progress/)
      expect(existsSync(engine), second.text).toBe(true)
      if (route === 'labels') {
        unlinkSync(engine)
        writeFileSync(retryOnce, '')
        const third = await invoke(['--telemetry'])
        expect(third.text).toContain('HOST-RETRY')
        const records = readFileSync(join(main, '.pair/working/telemetry/records.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as Record<string, unknown>)
        expect(records).toContainEqual(
          expect.objectContaining({
            kind: 'event',
            event: 'host-retry',
            card: '493',
            run: 'story-493',
            operation: 'gh:issue:read',
            attempt: 2,
            outcome: 'recovered',
          }),
        )
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  60000,
)
