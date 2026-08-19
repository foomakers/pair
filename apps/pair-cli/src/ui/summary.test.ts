import { describe, it, expect } from 'vitest'
import {
  SKIP_NOT_SHIPPED,
  SKIP_UNKNOWN_REGISTRY,
  buildOperationSummary,
  exitCodeFor,
  tallyRegistries,
  type RegistryResult,
} from './summary'

const ok = (name: string): RegistryResult => ({ name, target: `/t/${name}`, status: 'ok' })
const skipped = (name: string, reason: string): RegistryResult => ({
  name,
  target: `/t/${name}`,
  status: 'skipped',
  reason,
})
const failed = (name: string, error: string): RegistryResult => ({
  name,
  target: `/t/${name}`,
  status: 'failed',
  error,
})

describe('tallyRegistries', () => {
  it('counts each outcome separately', () => {
    const tally = tallyRegistries([
      ok('knowledge'),
      ok('skills'),
      skipped('adoption', SKIP_NOT_SHIPPED),
      failed('github', 'boom'),
    ])

    expect(tally).toEqual({ ok: 2, skipped: 1, failed: 1, total: 4 })
  })
})

describe('exitCodeFor — text and status never disagree (AC5)', () => {
  it('is 0 when everything the source ships installed', () => {
    expect(exitCodeFor({ ok: 2, skipped: 0, failed: 0, total: 2 })).toBe(0)
  })

  it('is 0 when the only non-ok registries were absent from the source', () => {
    expect(exitCodeFor({ ok: 2, skipped: 3, failed: 0, total: 5 })).toBe(0)
  })

  it('is 1 when a registry the source ships genuinely failed', () => {
    expect(exitCodeFor({ ok: 2, skipped: 3, failed: 1, total: 6 })).toBe(1)
  })

  it('is 1 when nothing at all was installed', () => {
    expect(exitCodeFor({ ok: 0, skipped: 3, failed: 0, total: 3 })).toBe(1)
  })

  it('is 0 for an empty run — there was nothing to do', () => {
    expect(exitCodeFor({ ok: 0, skipped: 0, failed: 0, total: 0 })).toBe(0)
  })
})

describe('buildOperationSummary', () => {
  it('keeps the plain wording when every registry installed', () => {
    const summary = buildOperationSummary([ok('a'), ok('b')], 'install', 1234)

    expect(summary.tone).toBe('success')
    expect(summary.headline).toBe('Installation complete (2 registries, 1.2s)')
    expect(summary.details).toEqual([])
    expect(summary.exitCode).toBe(0)
  })

  it('reads as success and names the skipped registries with the reason (AC1)', () => {
    const summary = buildOperationSummary(
      [
        ok('knowledge'),
        ok('skills'),
        skipped('adoption', SKIP_NOT_SHIPPED),
        skipped('github', SKIP_NOT_SHIPPED),
        skipped('agents', SKIP_NOT_SHIPPED),
      ],
      'install',
      79,
    )

    expect(summary.tone).toBe('success')
    expect(summary.headline).toBe(
      `Installation complete (2 ok, 3 skipped — ${SKIP_NOT_SHIPPED}, 79ms)`,
    )
    expect(summary.details).toEqual([`3 skipped — ${SKIP_NOT_SHIPPED}: adoption, github, agents`])
    expect(summary.headline).not.toContain('failed')
    expect(summary.exitCode).toBe(0)
  })

  it('groups the skip reasons when they differ, one detail line each', () => {
    const summary = buildOperationSummary(
      [
        ok('knowledge'),
        skipped('adoption', SKIP_NOT_SHIPPED),
        skipped('telemetry', SKIP_UNKNOWN_REGISTRY),
      ],
      'install',
      50,
    )

    expect(summary.headline).toBe('Installation complete (1 ok, 2 skipped, 50ms)')
    expect(summary.details).toEqual([
      `1 skipped — ${SKIP_NOT_SHIPPED}: adoption`,
      `1 skipped — ${SKIP_UNKNOWN_REGISTRY}: telemetry`,
    ])
  })

  it('still reports a real failure as failed — skipped never masks it (AC2)', () => {
    const summary = buildOperationSummary(
      [ok('knowledge'), skipped('adoption', SKIP_NOT_SHIPPED), failed('skills', 'copy exploded')],
      'install',
      79,
    )

    expect(summary.tone).toBe('error')
    expect(summary.headline).toBe(
      'Installation finished with errors (1 ok, 1 skipped, 1 failed, 79ms)',
    )
    expect(summary.exitCode).toBe(1)
  })

  it('reports a source that ships nothing installable as a no-op, not a success', () => {
    const summary = buildOperationSummary(
      [skipped('knowledge', SKIP_NOT_SHIPPED), skipped('skills', SKIP_NOT_SHIPPED)],
      'install',
      12,
    )

    expect(summary.tone).toBe('noop')
    expect(summary.headline).toBe(
      `Nothing to install (0 ok, 2 skipped — ${SKIP_NOT_SHIPPED}, 12ms)`,
    )
    expect(summary.exitCode).toBe(1)
  })

  it('labels the update operation with its own wording', () => {
    const summary = buildOperationSummary([ok('a')], 'update', 500)

    expect(summary.headline).toBe('Update complete (1 registry, 500ms)')
    expect(summary.log).toBe('Update complete: 1 ok, 0 skipped, 0 failed (500ms)')
  })

  it('logs the full tally so the log and the console agree', () => {
    const summary = buildOperationSummary(
      [ok('a'), skipped('b', SKIP_NOT_SHIPPED), failed('c', 'nope')],
      'install',
      42,
    )

    expect(summary.log).toBe('Installation complete: 1 ok, 1 skipped, 1 failed (42ms)')
  })
})
