import type { KbValidateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { validateKnowledgeBase } from '../kb-validate'

/**
 * Handles the kb-validate command execution.
 * Validates KB structure and manifest.
 *
 * @param config - The parsed kb-validate command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @returns Promise that resolves when validation completes successfully
 * @throws Error if validation fails
 */
export async function handleKbValidateCommand(
  config: KbValidateCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  const kbPath = config.path || fs.currentWorkingDirectory()

  await validateKnowledgeBase(kbPath, fs)
}
