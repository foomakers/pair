import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, setLogLevel, getLogLevel, sanitizeControlCharacters } from './observability'

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

describe('Logger - control-character sanitization', () => {
  beforeEach(() => {
    setLogLevel('INFO')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // A diagnostic often quotes content this process did NOT author — a config key
  // from a KB being validated, a package field, a registry name. Reproduced
  // verbatim, an ESC/OSC run clears the operator's screen and rewrites the
  // terminal title on emulators honouring OSC. Escaped once here, so no call site
  // has to remember.
  it.each([
    ['CSI screen clear', 'x\u001B[2Jy', 'x\\x1B[2Jy'],
    ['OSC title + BEL', 'x\u001B]0;pwned\u0007y', 'x\\x1B]0;pwned\\x07y'],
    ['C1 CSI (U+009B)', 'x\u009B2Jy', 'x\\x9B2Jy'],
    ['carriage return', 'x\rovery', 'x\\x0Dovery'],
    ['NUL and DEL', 'x\u0000\u007Fy', 'x\\x00\\x7Fy'],
  ])('escapes %s in the message', (_name, injected, expected) => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.warn(injected)

    expect(spy).toHaveBeenCalledWith(`⚠️ ${expected}`)
  })

  it('escapes control characters in a string payload too', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('boom', '\u001B[2Jwiped')

    expect(spy).toHaveBeenCalledWith('❌ boom \\x1B[2Jwiped')
  })

  it('keeps newline and tab (real formatting, not injection)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.info('a\nb\tc')

    expect(spy).toHaveBeenCalledWith('ℹ️ a\nb\tc')
  })
})

describe('sanitizeControlCharacters', () => {
  it('leaves ordinary text untouched', () => {
    expect(sanitizeControlCharacters('apps/**, docs/**')).toBe('apps/**, docs/**')
  })

  it('escapes as `\\xNN` (visible) rather than dropping — the operator sees WHAT was there', () => {
    expect(sanitizeControlCharacters('\u001B[31mred')).toBe('\\x1B[31mred')
  })
})
