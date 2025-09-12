import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, setLogLevel, getLogLevel } from './observability'

describe('Logger - basic behaviors', () => {
  beforeEach(() => {
    // Ensure default starting level
    setLogLevel('INFO')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should log security events', () => {
    // Test that security logging doesn't throw errors
    expect(() => {
      logger.security('INFO', 'test', 'Test security event')
    }).not.toThrow()
  })

  it('should log different levels without throwing', () => {
    expect(() => logger.info('Test info')).not.toThrow()
    expect(() => logger.warn('Test warning')).not.toThrow()
    expect(() => logger.error('Test error')).not.toThrow()
    expect(() => logger.debug('Test debug')).not.toThrow()
  })
})

describe('Logger - thresholds and normalization', () => {
  beforeEach(() => {
    // Ensure default starting level
    setLogLevel('INFO')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should respect log level thresholds and normalization', () => {
    const spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const spyInfo = vi.spyOn(console, 'log').mockImplementation(() => {})
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spyError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set to ERROR: only error should be logged
    setLogLevel('ERROR')
    expect(getLogLevel()).toBe('ERROR')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(spyDebug).not.toHaveBeenCalled()
    expect(spyInfo).not.toHaveBeenCalled()
    expect(spyWarn).not.toHaveBeenCalled()
    expect(spyError).toHaveBeenCalled()

    // Set to DEBUG: all levels should be allowed
    spyDebug.mockClear()
    spyInfo.mockClear()
    spyWarn.mockClear()
    spyError.mockClear()

    setLogLevel('debug') // lower-case should normalize
    expect(getLogLevel()).toBe('DEBUG')
    logger.debug('d2')
    logger.info('i2')
    logger.warn('w2')
    logger.error('e2')
    expect(spyDebug).toHaveBeenCalled()
    expect(spyInfo).toHaveBeenCalled()
    expect(spyWarn).toHaveBeenCalled()
    expect(spyError).toHaveBeenCalled()
  })
})
