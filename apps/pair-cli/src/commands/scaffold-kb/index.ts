/**
 * Public exports for scaffold-kb command: parser, handler, metadata and types
 *
 * These exports form the public API surface consumed by the CLI registry and
 * dispatcher.
 */
export { parseScaffoldKbCommand } from './parser'
export { handleScaffoldKbCommand } from './handler'
export { scaffoldKbMetadata } from './metadata'
export type { ScaffoldKbCommandConfig } from './parser'
export type { KbHost, KbIdentity } from './identity'
