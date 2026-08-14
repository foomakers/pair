import { beforeEach } from 'vitest'

/**
 * The KB cache root is overridable with `PAIR_KB_CACHE_DIR` (US-395). Suites that assert
 * slot paths compute them from `homedir()`, so an ambient override — on a developer
 * machine or in a CI image — would fail dozens of assertions with no hint at the cause.
 * Cleared before every test so the suite is hermetic with respect to it; a test that
 * exercises the override sets it itself.
 */
beforeEach(() => {
  delete process.env['PAIR_KB_CACHE_DIR']
})
