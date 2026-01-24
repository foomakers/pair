import { FileSystemService, detectLinkStyle } from '@pair/content-ops'
import { LogEntry } from '../../diagnostics'
import { handleUpdateLinkCommand } from './handler'

/**
 * Apply link transformation after install/update based on style preference.
 */
export async function applyLinkTransformation(
  fsService: FileSystemService,
  options: { linkStyle?: 'relative' | 'absolute' | 'auto'; minLogLevel?: string },
  pushLog: (level: LogEntry['level'], message: string) => void,
  mode: 'install' | 'update',
): Promise<void> {
  const linkStyle = options.linkStyle
  if (!linkStyle) return

  pushLog('info', `Applying link transformation: ${linkStyle}`)

  try {
    let style: 'relative' | 'absolute' = 'relative'

    if (linkStyle === 'auto') {
      if (mode === 'update') {
        const kbPath = fsService.resolve('.pair')
        if (await fsService.exists(kbPath)) {
          style = await detectLinkStyle(fsService, kbPath)
          pushLog('info', `Auto-detected link style: ${style}`)
        }
      } else {
        style = 'relative'
      }
    } else {
      style = linkStyle
    }

    await handleUpdateLinkCommand(
      {
        command: 'update-link',
        absolute: style === 'absolute',
        dryRun: false,
        verbose: options.minLogLevel === 'info' || options.minLogLevel === 'debug',
      },
      fsService,
    )
    pushLog('info', `Link transformation completed: ${style}`)
  } catch (err) {
    pushLog('warn', `Link transformation failed: ${String(err)}`)
  }
}
