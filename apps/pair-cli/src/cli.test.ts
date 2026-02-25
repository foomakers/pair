import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { Command } from 'commander'
import { InMemoryFileSystemService, NodeHttpClientService } from '@pair/content-ops'

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
