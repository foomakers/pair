import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

// Production-test defects of the autonomous cycle (batch B): prose contracts + hook + asset.

const ROOT = join(__dirname, '../../../..')
const skill = (rel: string): string =>
  readFileSync(join(__dirname, '../../dataset/.skills', rel, 'SKILL.md'), 'utf-8')
const mirror = (name: string): string =>
  readFileSync(join(ROOT, '.claude/skills', name, 'SKILL.md'), 'utf-8')

describe('defect 1: pre-commit runs docs:staleness', () => {
  it('hook runs ts:check and docs:staleness, with the measurement documented', () => {
    const hook = readFileSync(join(ROOT, '.husky/pre-commit'), 'utf-8')
    expect(hook).toMatch(/^pnpm ts:check$/m)
    expect(hook).toMatch(/^pnpm docs:staleness$/m)
    expect(hook).toMatch(/~3\.4s/)
  })
})

describe('defect 2: checkpoint write fallback', () => {
  const c = skill('capability/checkpoint')
  it('writes with the file-write tool, not shell', () => {
    expect(c).toMatch(/file-write tool, never a shell construct/)
  })
  it('refused write reports checkpoint-write-blocked with content inline, no silent skip', () => {
    expect(c).toMatch(/Report `checkpoint-write-blocked`/)
    expect(c).toMatch(/return the full rendered checkpoint inline/)
    expect(c).toMatch(/Path:.*checkpoint-write-blocked — content inline/)
  })
  it('mirror is in sync', () => {
    expect(mirror('pair-capability-checkpoint')).toMatch(/checkpoint-write-blocked/)
  })
})

describe('defect 3: resolve_tier has a real home', () => {
  const r = skill('process/review')
  it('review cites tier-resolve.sh wherever it cites resolve_tier', () => {
    const cites = r.match(/resolve_tier/g) ?? []
    expect(cites.length).toBeGreaterThan(0)
    expect(r).toMatch(/resolve_tier` from \[`tier-resolve\.sh`\]/)
    expect(r).toMatch(/resolve_tier` in \[`tier-resolve\.sh`\]/)
  })
  const tier = (labels: string): string =>
    execFileSync(
      'bash',
      [
        '-c',
        `source "${join(ROOT, '.pair/knowledge/assets/tier-resolve.sh')}"; resolve_tier ${labels}`,
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  it('tags only; untagged / malformed => red fail-safe; widens on max', () => {
    expect(tier("'risk:green'")).toBe('green')
    expect(tier("'risk:yellow'")).toBe('yellow')
    expect(tier("'bug' 'risk:red'")).toBe('red')
    expect(tier("'bug'")).toBe('red')
    expect(tier("''")).toBe('red')
    expect(tier("'risk:purple'")).toBe('red')
    expect(tier("'risk:green' 'risk:yellow'")).toBe('yellow')
  })
})

describe('defect 4: publish-pr registers pending at t0 via the script', () => {
  const p = skill('capability/publish-pr')
  it('calls pr-state.mjs register with the PR head sha, idempotent', () => {
    expect(p).toMatch(/pr-state\.mjs register --pr <n> --sha <PR head sha>/)
    expect(p).toMatch(/headRefOid/)
    expect(p).toMatch(/\*\*idempotent\*\*/)
    expect(p).toMatch(/read-failed/)
    expect(p).toMatch(/check-run-producer-exists/)
  })
})

describe('defect 5: review never switches the main checkout', () => {
  const r = skill('process/review')
  it('reads via gh pr diff / git show / throwaway worktree and forbids checkout', () => {
    expect(r).toMatch(/never switch the main checkout/)
    expect(r).toMatch(/gh pr diff <n>/)
    expect(r).toMatch(/git show <head-sha>:<path>/)
    expect(r).toMatch(/throwaway worktree/)
    expect(r).toMatch(/Never `git checkout` \/ `git switch` \/ `gh pr checkout`/)
  })
})

describe('defect 6: refine/implement strictness', () => {
  it('refine: Ready by state with only the Design flag missing => confirm and exit with a flag', () => {
    const r = skill('process/refine-story')
    expect(r).toMatch(/Ready by state, only a post-hoc DoR criterion missing/)
    expect(r).toMatch(/confirm and exit/)
    expect(r).toMatch(/DoR flag: Design line missing/)
  })
  it('refine: the branch needs a board state the State Mapping resolves to Ready; unreadable falls to partial path', () => {
    const r = skill('process/refine-story')
    expect(r).toMatch(/State Mapping resolves to `Ready`/)
    expect(r).toMatch(/unreadable or missing state falls to the normal/)
  })
  it('implement: accepts the plan-tasks inline checklist shape instead of HALT', () => {
    const i = skill('process/implement')
    expect(i).toMatch(/Inline checklist shape/)
    expect(i).toMatch(/AC Coverage/)
    expect(i).toMatch(/never a HALT/)
  })
  it('implement: unattended runs record the derived approach in checkpoint/PR body', () => {
    const i = skill('process/implement')
    expect(i).toMatch(/autonomous\/unattended run/)
    expect(i).toMatch(/recorded in the checkpoint and the PR body/)
  })
})
