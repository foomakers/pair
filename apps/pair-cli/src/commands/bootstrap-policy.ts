/**
 * Commands that PRODUCE KB content instead of consuming it, so the CLI must not
 * bootstrap (download/resolve) a knowledge base before running them.
 *
 * `package` zips an existing KB; `scaffold-kb` creates a new KB repo — neither
 * needs a KB installed in the current project, and bootstrapping one would be a
 * pointless (and network-dependent) side effect.
 */
const KB_PRODUCING_COMMANDS = new Set(['package', 'scaffold-kb'])

/** Whether the KB bootstrap should run before the given command executes. */
export function requiresKbBootstrap(commandName: string): boolean {
  return !KB_PRODUCING_COMMANDS.has(commandName)
}
