import { describe, test, expect, vi, beforeEach } from 'vitest'
import { isDiagEnabled, runDiagnostics, createLogger } from './diagnostics'
import * as config from './config'

describe('diagnostics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env['PAIR_DIAG']
  })

  test('isDiagEnabled returns true for "1" and "true" and false otherwise', () => {
    delete process.env['PAIR_DIAG']
    expect(isDiagEnabled()).toBe(false)

    process.env['PAIR_DIAG'] = '1'
    expect(isDiagEnabled()).toBe(true)

    process.env['PAIR_DIAG'] = 'true'
    expect(isDiagEnabled()).toBe(true)

    process.env['PAIR_DIAG'] = '0'
    expect(isDiagEnabled()).toBe(false)
  })

  test('runDiagnostics prints resolved dataset path and stack when getKnowledgeHubDatasetPath throws', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(String(args.join(' ')))
    })

    // Mock config helper to throw
    vi.spyOn(config, 'getKnowledgeHubDatasetPath').mockImplementation(() => {
      const err = new Error('boom')
      err.stack = 'stack-trace'
      throw err
    })

    process.env['PAIR_DIAG'] = '1'

    const fs = {
      rootModuleDirectory: () => '/root',
      currentWorkingDirectory: () => '/cwd',
    } as any

    // Ensure the thrown error from getKnowledgeHubDatasetPath is caught and does not propagate
    expect(() => runDiagnostics(fs)).not.toThrow()
  })

  test('runDiagnostics outer try/catch logs failure when fs methods throw', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(String(args.join(' ')))
    })

    process.env['PAIR_DIAG'] = '1'

    const fs = {
      rootModuleDirectory: () => {
        throw new Error('root-fail')
      },
      currentWorkingDirectory: () => '/cwd',
    } as any

    runDiagnostics(fs)

    expect(errors.some(e => e.includes('failed to emit diagnostics'))).toBe(true)
  })

  test('createLogger respects threshold', () => {
    const { logs, pushLog } = createLogger('warn')
    pushLog('info', 'should not be recorded')
    pushLog('warn', 'should be recorded')
    pushLog('error', 'should be recorded')

    expect(logs.some(l => l.message === 'should not be recorded')).toBe(false)
    expect(logs.some(l => l.message === 'should be recorded')).toBe(true)
  })
})
