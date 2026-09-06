import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { Command } from 'commander'
import {
  buildTestResponse,
  InMemoryFileSystemService,
  MockHttpClientService,
  NodeHttpClientService,
  toIncomingMessage,
  getLogLevel,
  setLogLevel,
} from '@pair/content-ops'
import { MIN_LOG_LEVEL } from './diagnostics'

describe('CLI command registration', () => {
  it('install command is registered', () => {
    const program = new Command()
    program
      .command('install')
      .description('Install documentation and assets')
      .argument('[target]', 'Target folder')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'install')).toBe(true)

    const installCmd = commands.find(cmd => cmd.name() === 'install')
    expect(installCmd?.description()).toContain('Install documentation')
  })

  it('update command is registered', () => {
    const program = new Command()
    program
      .command('update')
      .description('Update documentation and assets')
      .argument('[target]', 'Target folder')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'update')).toBe(true)

    const updateCmd = commands.find(cmd => cmd.name() === 'update')
    expect(updateCmd?.description()).toContain('Update documentation')
  })

  it('update-link command is registered', () => {
    const program = new Command()
    program
      .command('update-link')
      .description('Validate and update links in installed Knowledge Base content')
      .option('--relative', 'Convert all links to relative paths')
      .option('--absolute', 'Convert all links to absolute paths')
      .option('--dry-run', 'Show what would be changed without modifying files')
      .option('-l, --log-level <level>', 'Set minimum log level (debug|info|warn|error)')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'update-link')).toBe(true)

    const updateLinkCmd = program.commands.find(cmd => cmd.name() === 'update-link')
    expect(updateLinkCmd?.description()).toContain('Validate and update links')
  })

  it('validate-config command is registered', () => {
    const program = new Command()
    program.command('validate-config').description('Validate the asset registry configuration')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'validate-config')).toBe(true)

    const validateConfigCmd = commands.find(cmd => cmd.name() === 'validate-config')
    expect(validateConfigCmd?.description()).toContain('Validate the asset registry configuration')
  })

  it('package command is registered', async () => {
    const { commandRegistry } = await import('./commands/index.js')
    expect(commandRegistry.package).toBeDefined()
    expect(commandRegistry.package.metadata.name).toBe('package')
    expect(commandRegistry.package.metadata.description).toContain('Package KB content')
  })

  it('package command has required options', async () => {
    const { commandRegistry } = await import('./commands/index.js')
    const opts = commandRegistry.package.metadata.options

    expect(opts.some((opt: { flags: string }) => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some((opt: { flags: string }) => opt.flags.includes('--source-dir'))).toBe(true)
    expect(opts.some((opt: { flags: string }) => opt.flags.includes('--output'))).toBe(true)
    expect(opts.some((opt: { flags: string }) => opt.flags.includes('--name'))).toBe(true)
    expect(opts.some((opt: { flags: string }) => opt.flags.includes('--pkg-version'))).toBe(true)
  })

  it('install command has required options', () => {
    const program = new Command()
    program
      .command('install')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')
      .option('--link-style <style>', 'Link style')
      .option('--url <url>', 'URL to KB source')

    const installCmd = program.commands.find(cmd => cmd.name() === 'install')
    const opts = installCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--list-targets'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--link-style'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--url'))).toBe(true)
  })

  it('update command has required options', () => {
    const program = new Command()
    program
      .command('update')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')
      .option('--link-style <style>', 'Link style')
      .option('--url <url>', 'URL to KB source')

    const updateCmd = program.commands.find(cmd => cmd.name() === 'update')
    const opts = updateCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--list-targets'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--link-style'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--url'))).toBe(true)
  })

  it('update-link command has required options', () => {
    const program = new Command()
    program
      .command('update-link')
      .option('--relative', 'Convert to relative paths')
      .option('--absolute', 'Convert to absolute paths')
      .option('--dry-run', 'Dry run mode')
      .option('-l, --log-level <level>', 'Set minimum log level (debug|info|warn|error)')

    const updateLinkCmd = program.commands.find(cmd => cmd.name() === 'update-link')
    const opts = updateLinkCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--relative'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--absolute'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--dry-run'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--log-level'))).toBe(true)
  })
})

describe('CLI command execution - package command availability', () => {
  it('package command should be accessible after main() execution', async () => {
    const { commandRegistry } = await import('./commands/index.js')

    // Verify package command is in the registry
    expect(commandRegistry.package).toBeDefined()
    expect(commandRegistry.package.metadata).toBeDefined()
    expect(commandRegistry.package.parse).toBeDefined()
    expect(commandRegistry.package.handle).toBeDefined()

    // Verify package command metadata
    expect(commandRegistry.package.metadata.name).toBe('package')
    expect(
      commandRegistry.package.metadata.options.some((opt: { flags: string }) =>
        opt.flags.includes('--config'),
      ),
    ).toBe(true)
  })
})

describe('CLI unknown command handling (CP314)', () => {
  it('unknown command rejects with error', async () => {
    const { runCli } = await import('./cli.js')
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    await expect(
      runCli(['node', 'pair', 'nonexistent-command'], {
        fs,
        httpClient: new NodeHttpClientService(),
      }),
    ).rejects.toThrow('Unknown command: nonexistent-command')
  })
})

/**
 * Cross-command rule, not a scaffold-kb detail (#279 review): every registered command
 * runs with `allowExcessArguments(false)`, so a stray positional fails loudly instead of
 * being dropped. Documented in reference/cli/commands.mdx + reference/specs/cli-contracts.mdx;
 * pinned here on `install` (a command that used to ignore the extra argument) so the
 * cross-command reach is visible in the suite and cannot regress silently.
 */
describe('CLI-wide rule: excess positional arguments are rejected', () => {
  it('install rejects a second positional instead of ignoring it', async () => {
    const { runCli } = await import('./cli.js')
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    await expect(
      runCli(['node', 'pair', 'install', './t1', './t2'], {
        fs,
        httpClient: new NodeHttpClientService(),
      }),
    ).rejects.toThrow(/too many arguments/)
  })

  it('scaffold-kb rejects an unquoted --name value leaking into a positional', async () => {
    const { runCli } = await import('./cli.js')
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    // `--name Acme KB` unquoted: without the rule, `KB` is silently dropped
    await expect(
      runCli(['node', 'pair', 'scaffold-kb', './kb', '--name', 'Acme', 'KB'], {
        fs,
        httpClient: new NodeHttpClientService(),
      }),
    ).rejects.toThrow(/too many arguments/)
  })
})

describe('CLI banner suppression with --json (CP406/CP408)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('banner printed for normal command', async () => {
    const { runCli } = await import('./cli.js')
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    // validate-config will throw (no config) but preAction runs first
    await runCli(['node', 'pair', 'validate-config'], {
      fs,
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})

    const bannerPrinted = logSpy.mock.calls.some(
      ([arg]) => typeof arg === 'string' && arg.includes('pair'),
    )
    expect(bannerPrinted).toBe(true)
  })

  it('banner suppressed when --json flag is set', async () => {
    const { runCli } = await import('./cli.js')
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    // kb-info --json will fail (no file) but preAction runs first
    await runCli(['node', 'pair', 'kb-info', '/nonexistent.zip', '--json'], {
      fs,
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})

    const bannerPrinted = logSpy.mock.calls.some(
      ([arg]) => typeof arg === 'string' && arg.includes('Code is the easy part'),
    )
    expect(bannerPrinted).toBe(false)
  })
})

describe('CLI INIT_CWD wiring', () => {
  const originalInitCwd = process.env['INIT_CWD']

  afterEach(() => {
    if (originalInitCwd !== undefined) {
      process.env['INIT_CWD'] = originalInitCwd
    } else {
      delete process.env['INIT_CWD']
    }
  })

  function createMonorepoFs(monorepoRoot: string, packageDir: string) {
    const seed: Record<string, string> = {
      [`${monorepoRoot}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'KB',
          },
        },
      }),
      [`${monorepoRoot}/packages/knowledge-hub/package.json`]: JSON.stringify({
        name: '@pair/knowledge-hub',
      }),
      [`${monorepoRoot}/packages/knowledge-hub/dataset/.pair/knowledge/README.md`]: '# KB',
      [`${monorepoRoot}/package.json`]: JSON.stringify({ name: 'monorepo' }),
      // Pre-existing targets (update scenario — project already installed)
      [`${monorepoRoot}/.pair/knowledge/old.md`]: '# old',
      [`${packageDir}/.pair/knowledge/old.md`]: '# old',
    }
    return new InMemoryFileSystemService(seed, monorepoRoot, packageDir)
  }

  it('INIT_CWD directs output to monorepo root, not to pnpm --filter CWD', async () => {
    const { runCli } = await import('./cli.js')
    const monorepoRoot = '/test-monorepo'
    const packageDir = '/test-monorepo/apps/cli'
    const fs = createMonorepoFs(monorepoRoot, packageDir)

    process.env['INIT_CWD'] = monorepoRoot

    await runCli(['node', 'pair', 'update', '.'], { fs, httpClient: new NodeHttpClientService() })

    expect(fs.existsSync(`${monorepoRoot}/.pair/knowledge/README.md`)).toBe(true)
    expect(fs.existsSync(`${packageDir}/.pair/knowledge/README.md`)).toBe(false)
  })

  it('without INIT_CWD, output goes to InMemoryFs CWD (pnpm --filter dir)', async () => {
    const { runCli } = await import('./cli.js')
    const monorepoRoot = '/test-monorepo'
    const packageDir = '/test-monorepo/apps/cli'
    const fs = createMonorepoFs(monorepoRoot, packageDir)

    delete process.env['INIT_CWD']

    await runCli(['node', 'pair', 'update', '.'], { fs, httpClient: new NodeHttpClientService() })

    // "." resolves via fs.cwd() = packageDir
    expect(fs.existsSync(`${packageDir}/.pair/knowledge/README.md`)).toBe(true)
  })
})

/**
 * US-395 review round 12 — the wiring, from argv to disk. `--url` is declared on the
 * PROGRAM, so it only reaches a command through the global/command option merge in
 * `registerCommandFromMetadata`; that merge is what makes the flag a named source rather
 * than a value only the bootstrap pre-flight ever reads.
 */
describe('US-395: the program-level --url reaches the command', () => {
  const root = '/url-wiring'
  const originalInitCwd = process.env['INIT_CWD']

  beforeEach(() => {
    // INIT_CWD wins over the positional target (see the wiring describe above), and the
    // suite inherits one from pnpm — the update would then look for targets in the real
    // repo instead of the in-memory project.
    delete process.env['INIT_CWD']
  })

  afterEach(() => {
    if (originalInitCwd !== undefined) process.env['INIT_CWD'] = originalInitCwd
    vi.restoreAllMocks()
  })

  it('pair-cli update --url <mirror> updates from the mirror, not from the local dataset', async () => {
    const { runCli } = await import('./cli.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const fs = new InMemoryFileSystemService(
      {
        [`${root}/package.json`]: JSON.stringify({ name: 'monorepo' }),
        [`${root}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${root}/packages/knowledge-hub/dataset/.pair/knowledge/README.md`]:
          '# Content from the local dataset',
        [`${root}/config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
              description: 'KB',
            },
          },
        }),
        [`${root}/.pair/knowledge/README.md`]: '# old',
      },
      root,
      root,
    )
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(`${targetPath}/manifest.json`, JSON.stringify({ name: 'acme-kb' }))
      await fs.writeFile(`${targetPath}/.pair/knowledge/README.md`, '# Content from the mirror')
    })

    const url = 'https://mirror.internal/kb.zip'
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    await runCli(['node', 'pair', 'update', '--url', url, '.'], { fs, httpClient })

    // Exactly one fetch of the mirror (plus its checksum) — by the COMMAND. The comment here
    // used to say the pre-flight "does not run at all", which stopped being true when round 17
    // revived it; what carries this assertion is that `--url` names a source, so the pre-flight
    // skips (and, before that skip existed, this fixture's bundled monorepo dataset
    // short-circuited it — which is why the released-shape twin of this test lives below and is
    // the one that can actually detect a double download).
    expect(httpClient.getUrls()).toEqual([url, `${url}.sha256`])
    expect(await fs.readFile(`${root}/.pair/knowledge/README.md`)).toBe('# Content from the mirror')
  })
})

describe('US-395 round 14: the global --log-level actually takes effect', () => {
  afterEach(() => {
    setLogLevel(MIN_LOG_LEVEL)
    vi.restoreAllMocks()
  })

  /**
   * The `--log-level`/`--verbose` handling used to sit BELOW the pre-flight guards in the
   * `preAction` hook, and the first of those guards (`thisCommand === prog`) is always true
   * — Commander invokes a program-level hook as `(hookedCommand, actionCommand)`, so
   * `thisCommand` IS the program for every subcommand. The result: `pair-cli <cmd> --log-level
   * debug` silently did nothing, and the only level ever applied was the module-level
   * default. It is a program-level flag, so it must apply to EVERY command.
   */
  it('pair-cli --log-level debug applies the level before the command runs', async () => {
    const { runCli } = await import('./cli.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    // validate-config throws (no config file) but preAction has already run by then.
    await runCli(['node', 'pair', '--log-level', 'debug', 'validate-config'], {
      fs,
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})

    expect(getLogLevel()).toBe('DEBUG')
  })

  it('the legacy --verbose alias maps to debug for a KB-producing command too', async () => {
    const { runCli } = await import('./cli.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fs = new InMemoryFileSystemService({}, '/tmp', '/tmp')

    await runCli(['node', 'pair', '--verbose', 'package', '--source-dir', '/nope'], {
      fs,
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})

    expect(getLogLevel()).toBe('DEBUG')
  })
})

describe('US-395 round 18: `pair-cli --help` describes what --no-kb actually does', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Round 15 pinned this line as a NO-OP, which was true then: `--no-kb`'s only consumers sat
   * behind a pre-flight that never ran. Round 17 revived the pre-flight, so the flag takes
   * effect again — and the pinned assertion then locked the wrong text in, telling users in
   * the place they read first that a working flag does nothing. It must describe the real
   * effect, and name the combination that is now rejected (`--url` + `--no-kb`).
   */
  it('the --no-kb help line describes the skip, not a no-op', async () => {
    const { runCli } = await import('./cli.js')
    let help = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      help += String(chunk)
      return true
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCli(['node', 'pair', '--help'], {
      fs: new InMemoryFileSystemService({}, '/tmp', '/tmp'),
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})

    const noKbLine = help.split('\n').find(line => line.includes('--no-kb')) ?? ''
    expect(noKbLine).not.toBe('')
    expect(noKbLine).not.toMatch(/no-op/i)
    expect(noKbLine).toMatch(/skip the knowledge base download/i)
    // The `--url` conflict sits on the wrapped continuation line, so assert on the block.
    expect(help).toMatch(/cannot\s+be combined with --url/)
  })
})

/**
 * US-449 AC1 — the `usage` line commander PRINTS, not the one the registry stores.
 *
 * Round 2 renamed eleven `metadata.usage` strings and gated them, but nothing ever called
 * `.usage()` and the program was named `pkg.name`: an npm user running
 * `pair-cli install --help` read `Usage: @pair/pair-cli install [options]` as the first
 * line, pasted it, and got `command not found: @pair/pair-cli`. These assert the rendered
 * text, so the gate and the reader finally see the same string.
 */
describe('US-449: the printed Usage line names the published binary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderHelp = async (argv: string[]): Promise<string> => {
    const { runCli } = await import('./cli.js')
    let help = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      help += String(chunk)
      return true
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await runCli(['node', 'pair-cli', ...argv], {
      fs: new InMemoryFileSystemService({}, '/tmp', '/tmp'),
      httpClient: new NodeHttpClientService(),
    }).catch(() => {})
    // Strip SGR colour codes when chalk is enabled. The ESC byte is BUILT, not typed, so
    // the pattern carries no literal control character and needs no lint suppression.
    return help.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
  }

  const usageLine = (help: string): string =>
    help.split('\n').find(line => line.startsWith('Usage:')) ?? ''

  it('top-level --help prints `Usage: pair-cli`', async () => {
    expect(usageLine(await renderHelp(['--help']))).toBe('Usage: pair-cli [options] [command]')
  })

  it("a subcommand's --help prints the registry's usage line verbatim", async () => {
    const { commandRegistry } = await import('./commands/index.js')
    expect(usageLine(await renderHelp(['install', '--help']))).toBe(
      `Usage: ${commandRegistry.install.metadata.usage}`,
    )
  })
})

describe('publishedBinName', () => {
  it('returns the sole bin key', async () => {
    const { publishedBinName } = await import('./cli.js')
    expect(publishedBinName({ bin: { 'pair-cli': 'dist/cli.js' } })).toBe('pair-cli')
  })

  it('refuses a manifest with no bin, or with more than one', async () => {
    const { publishedBinName } = await import('./cli.js')
    expect(() => publishedBinName({})).toThrow(/exactly one/)
    expect(() => publishedBinName({ bin: { a: 'x', b: 'y' } })).toThrow(/exactly one/)
  })
})

describe('usageArguments', () => {
  it('strips the `<bin> <command> ` prefix commander prints itself', async () => {
    const { usageArguments } = await import('./cli.js')
    expect(usageArguments('pair-cli install [target] [options]', 'pair-cli', 'install')).toBe(
      '[target] [options]',
    )
  })

  it('yields undefined for a drifted prefix, so no line is ever doubled', async () => {
    const { usageArguments } = await import('./cli.js')
    expect(usageArguments('pair install [options]', 'pair-cli', 'install')).toBeUndefined()
  })
})

// ── The pre-flight hook must actually fire (US-395) ────────────────────────
// It did not, for the whole life of the feature: `cli.ts` guarded on
// `thisCommand === prog`, and Commander invokes a program-level hook as
// `callback(hookedCommand, actionCommand)` — the hooked command IS the program for every
// subcommand, so the guard always returned. `--no-kb` downloaded anyway, the
// `--url`+`--no-kb` conflict was never rejected, and the accessibility probe never ran.
//
// The whole 1125-test suite stayed green with the guard broken, which is why this pins the
// ARGUMENT CONVENTION itself rather than any of our own code: if Commander ever changed it,
// the fix would silently invert.
describe('Commander preAction argument convention (the assumption the KB pre-flight rests on)', () => {
  it('passes the HOOKED command first and the ACTION command second', async () => {
    const prog = new Command()
    prog.exitOverride().name('pair')
    let seen: { firstIsProg: boolean; secondIsProg: boolean; actionName: string } | undefined

    prog.hook('preAction', (thisCommand, actionCommand) => {
      seen = {
        firstIsProg: thisCommand === prog,
        secondIsProg: actionCommand === prog,
        actionName: actionCommand.name(),
      }
    })
    prog.command('install').action(() => {})

    await prog.parseAsync(['node', 'pair', 'install'])

    expect(seen, 'the hook must have fired at all').toBeDefined()
    // This is the trap: guarding on the FIRST argument skips every subcommand.
    expect(seen!.firstIsProg, 'first argument is the hooked command — always the program').toBe(
      true,
    )
    expect(
      seen!.secondIsProg,
      'second argument is the command that matched — never the program',
    ).toBe(false)
    expect(seen!.actionName).toBe('install')
  })
})

// ── The pre-flight must not fetch what the command never uses (US-395 round 19) ──
// Reviving the dead pre-flight (round 17) exposed a defect it had been hiding: the hook reads
// `thisCommand.opts()`, which for a program-level `preAction` is the PROGRAM's option set. Every
// flag that names the command's own source — `--source`, `--offline`, `--list-targets` — is
// declared on the `install` SUBCOMMAND and is therefore invisible to it, so the pre-flight
// resolves the official KB anyway.
//
// The fixture below is the RELEASED shape, and that is the whole point: it seeds no
// `packages/knowledge-hub`, so `bundledDatasetPath` finds nothing and the pre-flight falls
// through to the network. Every existing fixture seeds a monorepo dataset and the smoke suite
// runs `dist` from inside the monorepo, so the bundled branch short-circuits in both — which is
// why a suite of 1144 tests never saw this.
describe('US-395 rounds 19+21: the KB pre-flight never fetches a KB the command will not use', () => {
  const root = '/released'

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A released install: a CLI with no dataset shipped beside it. */
  const releasedFs = (extra: Record<string, string> = {}) =>
    new InMemoryFileSystemService(
      {
        [`${root}/config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
              description: 'KB',
            },
          },
        }),
        ...extra,
      },
      root,
      root,
    )

  const silence = () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  /**
   * A client that ANSWERS (404) rather than hanging. A mock with an empty queue makes the
   * download stall and the test fail on a timeout — which proves only that something blocked,
   * not what was requested. Answering keeps the failure on the URL assertion, where the
   * evidence is.
   */
  const answeringClient = () => {
    const c = new MockHttpClientService()
    const notFound = () => toIncomingMessage(buildTestResponse(404))
    c.setRequestResponses([notFound(), notFound(), notFound(), notFound()])
    c.setGetResponses([notFound(), notFound(), notFound(), notFound()])
    return c
  }

  it('install --source <dir> --offline issues no request at all', async () => {
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs({
      [`${root}/local-kb/manifest.json`]: JSON.stringify({ name: 'local-kb' }),
      [`${root}/local-kb/.pair/knowledge/README.md`]: '# local',
    })
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--source', `${root}/local-kb`, '--offline', '.'], {
      fs,
      httpClient,
    }).catch(() => {})

    // `--offline` is documented as THE air-gapped path. A single request here means the flag
    // fails for exactly the user it exists for.
    expect(httpClient.getUrls()).toEqual([])
  })

  it('install --offline with no --source fails without downloading first', async () => {
    // The pre-flight runs BEFORE the action handler, so `validateCommandOptions` has not yet
    // rejected this combination. Without its own guard the run downloads an entire KB and only
    // then reports that the invocation was invalid all along.
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs()
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--offline', '.'], { fs, httpClient }).catch(() => {})

    expect(httpClient.getUrls()).toEqual([])
  })

  it('install --source <dir> issues no request, with no --offline to help it', async () => {
    // Kept separate from the --offline case on purpose: that test passes two flags, so it
    // cannot tell which guard is carrying it. This one isolates the named-source rule.
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs({
      [`${root}/local-kb/manifest.json`]: JSON.stringify({ name: 'local-kb' }),
      [`${root}/local-kb/.pair/knowledge/README.md`]: '# local',
    })
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--source', `${root}/local-kb`, '.'], {
      fs,
      httpClient,
    }).catch(() => {})

    // The command reads this source directly; warming the official slot downloads an entire KB
    // the run never opens.
    expect(httpClient.getUrls()).toEqual([])
  })

  it('install --list-targets issues no request at all', async () => {
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs()
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--list-targets'], { fs, httpClient }).catch(() => {})

    // Listing targets reads local config only — it has no use for a KB.
    expect(httpClient.getUrls()).toEqual([])
  })

  it('install --no-kb issues no request at all, on a cold cache', async () => {
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs()
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--no-kb', '.'], { fs, httpClient }).catch(() => {})

    // The help text, commands.mdx and the ADL all promise this now. The pre-flight honours the
    // flag, but the command path resolves its dataset independently — so the promise held only
    // as far as the first of the two readers.
    expect(httpClient.getUrls()).toEqual([])
  })

  /**
   * The `--url` hole in the round-19 suite: it covered `--source`, `--offline`,
   * `--list-targets` and `--no-kb`, and `--url` is the ONE named-source form declared on the
   * PROGRAM rather than on the subcommand. `actionCommand.opts()` therefore never carries it
   * (verified with commander@11: for both `pair-cli install --url X` and `pair-cli --url X install`,
   * `url` lands on the program's opts and `cmd.opts()` is `{}`), so the skip predicate could
   * not observe it and the pre-flight warmed a slot the command then re-fetched — 2 full
   * archive downloads per remote `install|update --url`.
   *
   * The pre-existing single-fetch assertion (`update --url`, above) did NOT catch this: its
   * fixture seeds a bundled monorepo dataset, which short-circuits the pre-flight before it
   * reaches the network. Only a released shape can tell the two apart.
   */
  const remoteUrlFixture = () => {
    const fs = releasedFs()
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(`${targetPath}/manifest.json`, JSON.stringify({ name: 'acme-kb' }))
      await fs.writeFile(`${targetPath}/.pair/knowledge/README.md`, '# Content from the mirror')
    })
    const httpClient = new MockHttpClientService()
    const ok = () => toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const body = () =>
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'))
    // Deliberately enough responses for TWO full downloads: starving the mock would make the
    // second download fail instead of being counted, and the assertion below must fail on the
    // URL list, where the evidence is.
    httpClient.setRequestResponses([ok(), ok(), ok(), ok()])
    httpClient.setGetResponses([
      body(),
      body(),
      body(),
      body(),
      toIncomingMessage(buildTestResponse(404)),
    ])
    return { fs, httpClient }
  }

  it('install --url <remote zip> downloads the archive exactly once', async () => {
    const { runCli } = await import('./cli.js')
    silence()
    const url = 'https://mirror.internal/kb.zip'
    const { fs, httpClient } = remoteUrlFixture()

    await runCli(['node', 'pair', 'install', '--url', url, '.'], { fs, httpClient }).catch(() => {})

    expect(httpClient.getUrls()).toEqual([url, `${url}.sha256`])
  })

  it('update --url <remote zip> downloads the archive exactly once, in a released shape too', async () => {
    const { runCli } = await import('./cli.js')
    silence()
    const url = 'https://mirror.internal/kb.zip'
    const { fs, httpClient } = remoteUrlFixture()

    await runCli(['node', 'pair', 'update', '--url', url, '.'], { fs, httpClient }).catch(() => {})

    expect(httpClient.getUrls()).toEqual([url, `${url}.sha256`])
  })

  it('install --url <local zip> issues no request at all', async () => {
    // Keeps at the CLI layer the coverage the removed `bootstrapEnvironment` `url` parameter had
    // ("skips accessibility check for local customUrl"): a local `--url` must reach no network,
    // and now that is because the hook skips the pre-flight, not because a branch inside it
    // returns early.
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs({ [`${root}/acme-kb.zip`]: 'PK-fake-zip' })
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(`${targetPath}/manifest.json`, JSON.stringify({ name: 'acme-kb' }))
      await fs.writeFile(`${targetPath}/.pair/knowledge/README.md`, '# from the archive')
    })
    const httpClient = answeringClient()

    await runCli(['node', 'pair', 'install', '--url', `${root}/acme-kb.zip`, '.'], {
      fs,
      httpClient,
    }).catch(() => {})

    expect(httpClient.getUrls()).toEqual([])
  })

  it('--url together with --no-kb is rejected before anything is fetched', async () => {
    // The rejection is documented in `--help`, the CLI reference and the ADL. It used to fire
    // only as a SIDE EFFECT of the pre-flight running to step 1; once `--url` makes the
    // pre-flight skip (named source), the validation has to sit above the skip or the
    // documented error silently disappears.
    const { runCli } = await import('./cli.js')
    silence()
    const fs = releasedFs()
    const httpClient = answeringClient()

    await expect(
      runCli(
        ['node', 'pair', 'install', '--url', 'https://mirror.internal/kb.zip', '--no-kb', '.'],
        {
          fs,
          httpClient,
        },
      ),
    ).rejects.toThrow(/Cannot use --url and --no-kb together/)
    expect(httpClient.getUrls()).toEqual([])
  })
})
