/**
 * Public exports for package command: parser, handler, metadata and types
 *
 * These exports form the public API surface consumed by the CLI registry and
 * dispatcher.
 */
export { parsePackageCommand } from './parser'
export { handlePackageCommand } from './handler'
export { packageCommandMetadata } from './metadata'
export type { PackageCommandConfig } from './parser'
