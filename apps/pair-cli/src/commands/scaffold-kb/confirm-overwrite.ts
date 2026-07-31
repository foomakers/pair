import { confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import type { ConfirmOverwrite } from './apply-plan'

/**
 * Interactive overwrite confirmation for scaffold-owned files.
 *
 * Without a terminal there is nobody to ask, so the answer is "no": a
 * non-interactive run keeps the maintainer's version and reports it as skipped
 * (`--force` is the explicit way to regenerate). Never silently overwrite.
 */
export function createConfirmOverwrite(options: { isTty?: boolean } = {}): ConfirmOverwrite {
  const isTty = options.isTty ?? Boolean(process.stdout.isTTY)

  if (!isTty) {
    return async relativePath => {
      console.warn(
        `  ${chalk.yellow('!')} ${relativePath} differs from the scaffold — keeping it (no terminal to confirm; use --force to regenerate)`,
      )
      return false
    }
  }

  return relativePath =>
    confirm({
      message: `${relativePath} already exists and differs from the scaffold. Regenerate it?`,
      default: false,
    })
}
