// US-487 — the role packet a PROCESS realization carries.
//
// Runs from `.claude/workflows` ONLY: it drives `../../skills/pair-workflow-cycle/scripts/`, the
// INSTALLED skill layout, which the dataset lays out differently — same reason as
// cycle-coordinator.test.mjs, so it is not mirrored.
//
// Before this, `cycle-dispatch.mjs packet --style` returned the invocation line alone. The story
// says "the stage's agent definition body first, then the stage skill invocation"; the body was
// never read (`inline-role-body` was declared in REALIZATIONS and used by nothing), so the
// `agent-definition-missing` HALT could not exist — it guards a file nobody opened. The styled path
// also dropped the whole guardrail paragraph the in-session path carries: reviewer blindness, "the
// run directory lives in the MAIN checkout", "Do NOT merge".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const SCRIPTS = join(REPO, '.claude', 'skills', 'pair-workflow-cycle', 'scripts')

const CARD = JSON.stringify({ id: '135', branch: 'feature/US-135-x', base: 'origin/main', title: 't' })
const PREPARE = JSON.stringify({ step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1, context: 'fresh' })

const packet = (scriptsDir, style) => {
  const args = [join(scriptsDir, 'cycle-dispatch.mjs'), 'packet', '--next', PREPARE, '--card', CARD, '--run', 'story-135', '--workflow-version', '4.0.1']
  if (style) args.push('--style', style)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { status: r.status, out: JSON.parse(r.stdout) }
}

// A line of the preparer's OWN definition body — present only if the file was actually read.
const ROLE_LINE = 'You own the preparation stage of a delivery cycle'

test('instruction style: the role leads, then the invocation, then the guardrails', () => {
  const { out } = packet(SCRIPTS, 'instruction')
  assert.ok(out.prompt.startsWith(ROLE_LINE), 'the role body must open an instruction prompt')
  assert.match(out.prompt, /Run the pair-workflow-red-spec skill with these arguments:/)
  // Frontmatter is harness configuration, never role instructions.
  assert.doesNotMatch(out.prompt, /^model: /m)
  assert.doesNotMatch(out.prompt, /^tools: /m)
})

test('slash style: the command leads, and the role and guardrails still travel', () => {
  const { out } = packet(SCRIPTS, 'slash')
  assert.ok(out.prompt.startsWith('/pair-workflow-red-spec '), 'the slash command must lead')
  assert.ok(out.prompt.includes(ROLE_LINE), 'the role body must still be carried')
})

test('every styled prompt carries the guardrails the in-session path always had', () => {
  for (const style of ['instruction', 'slash']) {
    const { out } = packet(SCRIPTS, style)
    assert.match(out.prompt, /Do NOT merge\./, `${style}: no-merge guardrail`)
    assert.match(out.prompt, /lives in the MAIN checkout/, `${style}: run-directory anchor`)
    assert.match(out.prompt, /Do NOT read /, `${style}: reviewer blindness`)
  }
})

test('the in-session path (no --style) is byte-for-byte what the in-session coordinator shipped: no role body', () => {
  // Zero regression for the subagent realization, which selects its role by `agentType` and so
  // must NOT also receive the body as prose.
  const { out } = packet(SCRIPTS)
  assert.ok(out.prompt.startsWith('Invoke **'), 'unstyled prompt keeps its own opening')
  assert.ok(!out.prompt.includes(ROLE_LINE), 'unstyled prompt must not duplicate the role')
})

test('a stage whose agent definition is missing HALTs agent-definition-missing, naming the role', () => {
  // A throwaway install with the scripts in place and an EMPTY agents directory — the real shape
  // of a project that installed the skill without its agents.
  const root = mkdtempSync(join(tmpdir(), 'role-packet-'))
  try {
    const scripts = join(root, '.claude', 'skills', 'pair-workflow-cycle', 'scripts')
    mkdirSync(scripts, { recursive: true })
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
    cpSync(join(SCRIPTS, 'cycle-dispatch.mjs'), join(scripts, 'cycle-dispatch.mjs'))
    cpSync(join(SCRIPTS, 'cycle-state.mjs'), join(scripts, 'cycle-state.mjs'))

    const { status, out } = packet(scripts, 'instruction')
    assert.notEqual(status, 0, 'a missing role is fail-closed, never a degraded success')
    assert.equal(out.halt, 'agent-definition-missing')
    assert.equal(out.role, 'pair-fix-test-author')
    assert.match(out.detail, /pair-fix-test-author/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ══ US-506 T-8 (AC12) — the bounded-commands guardrail rides EVERY packet, styled and unstyled ══
// US-487: three stage agents stalled on background waits and were resumed by hand; two reviewers
// removed an engine stub to test "engine missing" and the CLI fell through to the real `claude`.
const GUARD_RE = [/Run only foreground, time-bounded commands: never start a background process and never wait on one\./, /never spawn a real engine or a real `gh`/, /a PATH that contains no engine directory at all/]
const CONTRACT = { path: '/main/.pair/working/runs/story-135/135/r1-g1-red-contract.json', hash: `sha256:${'1'.repeat(64)}`, snapshot: 'c'.repeat(40) }
const NEXTS = [
  { step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1 },
  { step: 'validate', phase: 'r1-g1', round: 1, attempt: 1, base: 'a'.repeat(40), contract: CONTRACT },
  { step: 'implement', mode: 'initial', phase: 'a0', round: 0, attempt: 1 },
  { step: 'implement', mode: 'initial', phase: 'a0', round: 0, attempt: 1, base: 'a'.repeat(40), contract: CONTRACT },
  { step: 'green', mode: 'remediation', phase: 'r1-g1', round: 1, attempt: 1, base: 'a'.repeat(40), contract: CONTRACT },
  { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1, base: 'a'.repeat(40), pr: 7 },
]
test('US-506 T-8: every packet — each step, unstyled, slash and instruction — states the bounded-commands guardrail', () => {
  for (const next of NEXTS)
    for (const style of [undefined, 'slash', 'instruction']) {
      const args = [join(SCRIPTS, 'cycle-dispatch.mjs'), 'packet', '--next', JSON.stringify(next), '--card', CARD, '--run', 'story-135', '--workflow-version', '4.0.1']
      if (style) args.push('--style', style)
      const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
      assert.equal(r.status, 0, r.stdout + r.stderr)
      const { prompt } = JSON.parse(r.stdout)
      for (const re of GUARD_RE) assert.match(prompt, re, `${next.step}${next.contract ? '+contract' : ''} / ${style ?? 'unstyled'}`)
    }
})

test('US-506 T-8: the batch engine spells the guardrail byte-identically — the sandbox cannot import it, so the two sources are held equal', async () => {
  const { readFileSync } = await import('node:fs')
  const constOf = src => /const BOUNDED_COMMANDS = ('(?:[^'\\]|\\.)*')/.exec(src)?.[1]
  const dispatchSrc = readFileSync(join(SCRIPTS, 'cycle-dispatch.mjs'), 'utf8')
  const batchSrc = readFileSync(join(REPO, '.claude', 'workflows', 'pair-implement-batch.js'), 'utf8')
  assert.ok(constOf(dispatchSrc), 'cycle-dispatch.mjs declares BOUNDED_COMMANDS')
  assert.equal(constOf(batchSrc), constOf(dispatchSrc))
  assert.match(batchSrc, /Do NOT merge\. \$\{BOUNDED_COMMANDS\}`/)
})
