/**
 * Public exports for the coverage-ratchet command: parser, handler, metadata and types.
 *
 * These exports are used by the CLI command registry and dispatcher.
 */
export { parseCoverageRatchetCommand } from './parser'
export { handleCoverageRatchetCommand } from './handler'
export { coverageRatchetMetadata } from './metadata'
export type { CoverageRatchetCommandConfig } from './parser'
