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
