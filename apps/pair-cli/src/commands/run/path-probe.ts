import { join, isAbsolute } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { ExecutableProbe } from './resolve-engine'

/**
 * Where an engine's executable is, in the order a machine can actually answer it.
 *
 * `pi` is the case that forced this: it ships in the repository's own `node_modules/.bin`, which is
 * on PATH inside a package script and nowhere else — so `pair-cli run --engine pi` typed in a plain
 * shell could not find an engine that was installed all along.
 *
 * 1. **`engine.bin.<id>` in `pair.config.json`** — an explicit declaration always wins, and is the
 *    only answer for an engine installed somewhere nobody can guess.
 * 2. **On PATH, or given as an absolute path** — the ordinary case, unchanged.
 * 3. **The repository's own `node_modules/.bin`** — installed as a dependency of this project.
 *
 * Nothing else is tried. An engine found nowhere is reported with the exact key to declare, rather
 * than a bare "not installed" for a binary that may well be sitting in the repo.
 */
export interface EngineBinaryResolution {
  readonly command: string
  readonly from: 'config' | 'path' | 'repo-bin'
}

export function resolveEngineBinary(input: {
  readonly id: string
  readonly command: string
  readonly fs: FileSystemService
  readonly repoRoot: string
  readonly declaredBin?: Readonly<Record<string, string>> | undefined
  readonly probe: ExecutableProbe
}): EngineBinaryResolution | undefined {
  const declared = input.declaredBin?.[input.id]
  if (declared !== undefined && input.fs.existsSync(declared)) {
    return { command: declared, from: 'config' }
  }
  if (input.probe(input.command)) return { command: input.command, from: 'path' }
  const repoBin = join(input.repoRoot, 'node_modules', '.bin', input.command)
  if (input.fs.existsSync(repoBin)) return { command: repoBin, from: 'repo-bin' }
  return undefined
}

/**
 * Builds the PATH existence probe `assertEngineAvailable` consumes.
 *
 * Separate from resolution on purpose: resolution stays pure and testable, and the one piece
 * that touches the filesystem is a two-line function injected into it. `PATHEXT` is honoured
 * so the probe means the same thing on Windows, where `claude` is `claude.cmd`.
 */
export function createExecutableProbe(
  fs: FileSystemService,
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): ExecutableProbe {
  const pathSeparator = platform === 'win32' ? ';' : ':'
  const directories = (env['PATH'] ?? '').split(pathSeparator).filter(entry => entry.length > 0)
  const extensions =
    platform === 'win32'
      ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(ext => ext.length > 0)
      : ['']

  return (command: string) => {
    const candidates = isAbsolute(command)
      ? [command]
      : directories.flatMap(directory => [join(directory, command)])
    return candidates.some(candidate =>
      extensions.some(extension => fs.existsSync(`${candidate}${extension}`)),
    )
  }
}
