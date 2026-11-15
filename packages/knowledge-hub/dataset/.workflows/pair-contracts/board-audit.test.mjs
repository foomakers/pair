import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, runAudit } from '../../skills/pair-workflow-cycle/scripts/board-audit.mjs'

test('AC-2: audit is report-only unless --apply is explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false })
  assert.deepEqual(parseArgs(['--apply', '--repo', 'owner/repo']), { apply: true, repo: 'owner/repo' })
  assert.throws(() => parseArgs(['--fix']), /unknown argument/)
  let writes = 0
  const hosts = {
    pm: {
      listCards: () => [{ id: '1' }],
      cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState: 'Todo', member: true }),
      setBoardState: () => { writes++; return { confirmed: true } },
    },
    code: { linkedPr: () => 'open' },
  }
  const adoption = '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Inspect | Review |\n'
  assert.equal(runAudit({ hosts, adoption }).mismatches[0].expected, 'Inspect')
  assert.equal(writes, 0)
  runAudit({ hosts, adoption, apply: true })
  assert.equal(writes, 1)
})

// r0-6 / AC-7: a human repair (--apply) is recorded once per repaired card as a manual unblock in the
// card's run trail, which delivery telemetry reads (#641); report-only and clean reruns record nothing.
test('AC-7: --apply records one attributed manual-unblock per repaired card', async () => {
  const { mkdtempSync, mkdirSync, readFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = mkdtempSync(join(tmpdir(), 'pair-audit-unblock-'))
  const trail = join(root, '.pair', 'working', 'runs', 'story-1', '1')
  mkdirSync(trail, { recursive: true })
  let boardState = 'Todo'
  const hosts = {
    pm: {
      listCards: () => [{ id: '1' }, { id: '2' }],
      cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState, member: true }),
      setBoardState: ({ state }) => { boardState = state; return { confirmed: true } },
    },
    code: { linkedPr: ({ id }) => (id === '1' ? 'open' : 'none') },
  }
  const file = join(trail, 'manual-unblocks.jsonl')
  runAudit({ hosts, adoption: '', root, who: 'alice' })
  assert.equal(existsSync(file), false, 'report-only records nothing')
  runAudit({ hosts, adoption: '', apply: true, root, who: 'alice' })
  runAudit({ hosts, adoption: '', apply: true, root, who: 'alice' })
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(lines.map(({ at, ...rest }) => rest), [{ kind: 'manual-unblock', who: 'alice', reason: 'board-repair: Todo -> Review', card: '1' }])
  assert.match(lines[0].at, /^\d{4}-\d\d-\d\dT/)
})
