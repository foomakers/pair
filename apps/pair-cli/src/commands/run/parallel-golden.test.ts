import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { RootCandidate } from './root-plan'
import type { CardProcessRunner } from './parallel'

/**
 * US-522 AC13 — default behaviour unchanged. The golden below was captured on `main` (043abbe7,
 * before the loop wiring) for `--root X --parallel N` with none of the new flags; stdout, the audit
 * lines and the exit code are asserted byte for byte (timestamps normalized).
 */

const cwd = '/project'
const POLICY = '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3\n'

const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
  ...extra,
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function capture(candidates: RootCandidate[], exits: Record<string, number> = {}) {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  const audit: string[] = []
  const deps: RunHandlerDependencies = {
    selectCandidates: async () => candidates,
    runCardProcess: vi.fn<CardProcessRunner>(async ({ card: c }) => ({
      exitCode: exits[c.id] ?? 0,
      signal: null,
    })),
    acquireLock: ({ card: id }) => ({
      kind: 'acquired',
      lock: { path: `/locks/${id}`, release: () => {} },
    }),
    appendAudit: (_path, line) => void audit.push(line),
  }
  const fs = new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      [`${cwd}/${POLICY_PATH}`]: POLICY,
    },
    cwd,
    cwd,
  )
  const previous = process.env['PATH']
  process.env['PATH'] = '/bin'
  try {
    const code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true }),
      fs,
      deps,
    )
    const norm = (s: string) => s.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<ts>')
    return { code, stdout: lines.map(norm), audit: audit.map(norm) }
  } finally {
    process.env['PATH'] = previous
  }
}

describe('US-522 AC13 — --root --parallel without any new flag is byte-identical to US-491', () => {
  it('golden: two cards, one failing', async () => {
    const out = await capture([card('10'), card('11')], { '11': 1 })
    expect(out).toMatchInlineSnapshot(`
      {
        "audit": [
          "<ts> event=batch root=66 started=<ts> parallel=2 effective=2 attempted=10,11 outcomes=10:completed(exit 0),11:failed(exit 1) excluded=(none)",
        ],
        "code": 1,
        "stdout": [
          "pair-cli run --parallel",
          "  Engine: claude — \`claude -p --output-format stream-json --verbose\` (from schema default)",
          "  Scope: pair-next --root 66 --filter risk:green (## Eligibility)",
          "  Policy: .pair/adoption/tech/automation.md · audit automation/loop-audit.md",
          "  Requested: --parallel 2 · ## Max Parallelism 3",
          "  Unit: one \`pair-cli run --card <id>\` process per card",
          "  Merge: the driver never merges, and \`## Auto-Advance\` is (none) — nothing is pushed or merged unattended; every gate stays human (AC10)",
          "  Autonomy: explicit opt-in (--permission-mode bypassPermissions)",
          "  Project trust: nothing to approve — claude -p skips the workspace trust dialog (claude --help)",
          "  Plan: Run (2): #10, #11",
          "  Effective parallelism: 2 = min(dependency-allowed 2, ## Max Parallelism 3, --parallel 2) — bound by dependency-allowed and --parallel",
          "  Started #10: pair-cli run --card 10",
          "  Started #11: pair-cli run --card 11",
          "  Ended #10: completed — exit 0",
          "  Ended #11: failed — exit 1",
          "  Batch outcome:",
          "    #10: completed — exit 0",
          "    #11: failed — exit 1",
        ],
      }
    `)
  })

  it('golden: nothing selected', async () => {
    const out = await capture([])
    expect(out).toMatchInlineSnapshot(`
      {
        "audit": [],
        "code": 0,
        "stdout": [
          "pair-cli run --parallel",
          "  Engine: claude — \`claude -p --output-format stream-json --verbose\` (from schema default)",
          "  Scope: pair-next --root 66 --filter risk:green (## Eligibility)",
          "  Policy: .pair/adoption/tech/automation.md · audit automation/loop-audit.md",
          "  Requested: --parallel 2 · ## Max Parallelism 3",
          "  Unit: one \`pair-cli run --card <id>\` process per card",
          "  Merge: the driver never merges, and \`## Auto-Advance\` is (none) — nothing is pushed or merged unattended; every gate stays human (AC10)",
          "  Autonomy: explicit opt-in (--permission-mode bypassPermissions)",
          "  Project trust: nothing to approve — claude -p skips the workspace trust dialog (claude --help)",
          "  Nothing to do: pair-next --root 66 selected no card.",
        ],
      }
    `)
  })
})
