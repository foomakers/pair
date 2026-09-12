import chalk from 'chalk'
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

/**
 * Colour is an ambient input too. `chalk` honours `FORCE_COLOR`, which a developer may well have
 * exported to keep their tools colourful — and then every assertion comparing rendered output
 * against a literal (`toContain('✓ skills')`) fails, because the tick arrives wrapped in ANSI
 * escapes. CI passes only because the variable is absent there, so the suite is green in the one
 * place nobody is watching it and red on the machine actually running it. `NO_COLOR` does not
 * rescue this: in chalk, `FORCE_COLOR` takes precedence.
 *
 * Pinned once, for the whole package: assertions read the text, never the terminal that spawned
 * them. A test that genuinely exercises colouring sets its own level.
 */
chalk.level = 0
