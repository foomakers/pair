import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('R754-10: builds workflow declarations before type-checking dev-tools from a clean checkout', () => {
  const root = join(__dirname, '../../../..')
  const output = execFileSync(
    join(root, 'node_modules/.bin/turbo'),
    ['run', 'ts:check', '--filter=@pair/dev-tools', '--dry=json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const { tasks } = JSON.parse(output) as {
    tasks: { taskId: string; dependencies: string[] }[]
  }
  expect(tasks.find(task => task.taskId === '@pair/dev-tools#ts:check')?.dependencies).toContain(
    '@pair/workflows#build',
  )
})
