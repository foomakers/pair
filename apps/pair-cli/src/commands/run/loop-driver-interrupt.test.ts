import { it, expect, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'

/**
 * US-573 edge case: Ctrl+C ⇒ `loop-end interrupted` in the audit, live lines finalized, process
 * exits 130. Its own file: the interruption is process-global and must not leak into other tests.
 */
it('Ctrl+C writes loop-end interrupted to the live audit and exits 128+SIGINT', async () => {
  vi.stubEnv('PATH', '/bin')
  const cwd = '/project'
  const fs = new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
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
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      '/bin/claude': '',
      [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green\n',
    },
    cwd,
    cwd,
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  const audit: string[] = []
  void handleRunCommand(parseRunCommand({ root: '212' }), fs, {
    runAudit: (_path, line) => void audit.push(line),
    runIteration: () => {
      process.emit('SIGINT', 'SIGINT')
      return new Promise(() => {})
    },
  })
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130))
  const end = JSON.parse(audit.at(-1)!) as { event: string; detail: { status: string } }
  expect(end.event).toBe('loop-end')
  expect(end.detail.status).toBe('interrupted')
})
