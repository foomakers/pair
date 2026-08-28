import { join, isAbsolute } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { ExecutableProbe } from './resolve-engine'

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
