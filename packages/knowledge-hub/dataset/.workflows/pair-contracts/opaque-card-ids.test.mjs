// US-572 AC1/AC2/AC4: a card id is OPAQUE (`IN-01`, `01-01-001`, `ENG-123`, `572`) — validated by the bound PM
// adapter's parseCardRef, never by /^\d+$/, never Number()-ed; `--pr` stays a number (code-host id).
// RUNS FROM `.claude/workflows` ONLY.
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { resolvePolicy, parse } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'
import { parseArgs as prepareArgs } from '../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs'
import { parseArgs as mergeArgs, closeStory } from '../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs'

const SCRIPTS = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/', import.meta.url))
const IDS = ['IN-01', '01-01-001', 'ENG-123', '572']
const BAD = ['../x', 'a/b', '/etc/passwd', 'a b', '..', 'a..b']
const GATE = JSON.stringify({ mode: 'never', has: [], lacks: [] })

function project(wow) {
  const root = mkdtempSync(join(tmpdir(), 'opaque-ids-'))
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), wow)
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'automation.md'), '# Automation\n')
  return root
}
const FS_WOW = '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n'

test('AC1: --root takes an opaque id (pure resolve) and refuses a path-shaped one', () => {
  for (const id of IDS) {
    const r = resolvePolicy({ args: { root: id } })
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r.errors)}`)
    assert.equal(r.effective.root.value, id)
  }
  assert.equal(resolvePolicy({ args: { root: '#572' } }).effective.root.value, '572')
  for (const bad of BAD) assert.match(resolvePolicy({ args: { root: bad } }).errors.map(e => e.reason).join(), /card id/, bad)
  assert.match(parse('# A\n\n## Autonomy\n\nroot: a/b\n').errors.map(e => e.reason).join(), /card id/)
})

test('AC1: the CLI validates --root through the BOUND adapter — IN-01 on filesystem, refused on github', () => {
  const run = (wow, root) => {
    const dir = project(wow)
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'autonomy-policy.mjs'), 'resolve', '--adoption', join(dir, '.pair/adoption/tech/automation.md'), '--args', JSON.stringify({ root })], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout)
    return JSON.parse(r.stdout)
  }
  const fsOk = run(FS_WOW, 'IN-01')
  assert.equal(fsOk.ok, true, JSON.stringify(fsOk.errors))
  assert.equal(fsOk.effective.root.value, 'IN-01')
  const gh = run('- `pm-tool`: `github`\n', 'IN-01')
  assert.equal(gh.ok, false)
  assert.match(gh.errors.map(e => e.reason).join(), /not a github card/)
  assert.equal(run('- `pm-tool`: `github`\n', '572').ok, true)
})

test('AC2: cycle-prepare --story keeps an opaque id unchanged; a path-shaped one is refused', () => {
  for (const id of IDS) {
    assert.equal(prepareArgs(['complete', '--dir', '.', '--story', id, '--gate', GATE, '--source', 'argument']).opts.story, id)
    assert.equal(prepareArgs(['decide', '--gate', GATE, '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--story', id, '--dir', '.']).opts.story, id)
  }
  for (const bad of BAD) assert.throws(() => prepareArgs(['complete', '--dir', '.', '--story', bad, '--gate', GATE, '--source', 'argument']), /card id/, bad)
})

test('AC2: cycle-merge --story is opaque, --pr stays numeric', () => {
  for (const id of IDS) {
    const { opts } = mergeArgs(['check', '--dir', '.', '--story', id, '--pr', '9', '--reviewedHead', 'a'.repeat(40), '--cardTier', 'risk:green', '--mergeGate', GATE])
    assert.deepEqual([opts.story, opts.pr], [id, 9])
    assert.equal(mergeArgs(['escalate', '--dir', '.', '--story', id, '--stage', 'merge', '--conditions', '["has:risk:red"]']).opts.story, id)
  }
  for (const bad of BAD) assert.throws(() => mergeArgs(['check', '--dir', '.', '--story', bad, '--pr', '9', '--reviewedHead', 'a'.repeat(40), '--cardTier', 'risk:green', '--mergeGate', GATE]), /card id/, bad)
  assert.throws(() => mergeArgs(['check', '--dir', '.', '--story', 'IN-01', '--pr', 'IN-02', '--reviewedHead', 'a'.repeat(40), '--cardTier', 'risk:green', '--mergeGate', GATE]), /--pr must be a number/)
})

test('AC2: closeStory never Number()s the story — the board step names the opaque id when the cascade fails', () => {
  const seen = []
  const hosts = {
    pm: {
      readCard: () => ({ body: '' }),
      updateCard: () => ({}),
      closeAndCascade: () => {
        throw new Error('boom')
      },
      setBoardState: ({ id }) => (seen.push(id), { confirmed: true }),
    },
  }
  closeStory({ hosts, story: '01-01-001', branch: undefined, root: mkdtempSync(join(tmpdir(), 'close-')), fs: { exists: () => false, rm: () => {} } })
  assert.deepEqual(seen, ['01-01-001'])
})

test('AC4: whoami resolves @me through the bound adapter; filesystem HALTs not-implemented naming resolveUser — never gh api user', () => {
  const dir = project(FS_WOW)
  const runDir = join(dir, '.pair', 'working', 'runs', 'r', 'IN-01')
  mkdirSync(runDir, { recursive: true })
  const env = { ...process.env, PATH: '/nonexistent' }
  const r = spawnSync(process.execPath, [join(SCRIPTS, 'cycle-state.mjs'), 'whoami', '--dir', runDir], { encoding: 'utf8', cwd: dir, env })
  assert.equal(r.status, 1, r.stdout)
  assert.deepEqual(JSON.parse(r.stdout), { halt: 'not-implemented', method: 'resolveUser', pmTool: 'filesystem', detail: 'host adapter filesystem does not implement resolveUser' })
})

test('the pure guard (card-id.mjs) and the adapter-kit guard are one rule', async () => {
  const { checkCardId, CARD_ID_RE } = await import('../../skills/pair-workflow-cycle/scripts/card-id.mjs')
  const kit = await import('../../skills/pair-workflow-cycle/scripts/host/adapter-kit.mjs')
  assert.equal(kit.CARD_ID_RE.source, CARD_ID_RE.source)
  for (const v of [...IDS, ...BAD, '#572', 'x'.repeat(121)]) {
    let kitId = null
    try {
      kitId = kit.assertCardId(v)
    } catch {}
    assert.equal(kitId, checkCardId(v).id ?? null, v)
  }
})
