/**
 * Which commands need a knowledge base RESOLVED (and possibly downloaded) before they run.
 *
 * An ALLOW-list, deliberately. The previous version was a deny-list naming the two
 * KB-producing commands (`package`, `scaffold-kb`) — written while the pre-flight hook was
 * unreachable, so it was never exercised: `cli.ts` guarded on `thisCommand === prog`, which
 * Commander makes always true by passing the hooked command as the first argument.
 *
 * Waking that hook up makes this list load-bearing: every command NOT exempted now resolves
 * a KB before running, which for a command that only reads local state means a pointless,
 * network-dependent side effect — and an outright failure for anyone offline. With an
 * allow-list, a command added tomorrow must opt IN to that; with a deny-list it would
 * inherit the network simply by not being remembered here.
 *
 * `install` and `update` are the two that genuinely consume a KB. Everything else —
 * `kb-info`, `kb-validate`, `kb-verify`, `validate-config`, `update-link` — reads what is
 * already on disk, and `package`/`scaffold-kb` produce KB content rather than consuming it.
 */
const KB_CONSUMING_COMMANDS = new Set(['install', 'update'])

/** Whether the KB bootstrap should run before the given command executes. */
export function requiresKbBootstrap(commandName: string): boolean {
  return KB_CONSUMING_COMMANDS.has(commandName)
}
