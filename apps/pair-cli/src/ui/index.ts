export {
  createCliPresenter,
  createSilentPresenter,
  type CliPresenter,
  type RegistryProgress,
} from './presenter'
// `buildOperationSummary` / `OperationSummary` are deliberately NOT here: composing a
// summary is the presenter's job, and the handlers only ever hand it results. Keeping them
// off the barrel keeps the module's public surface to what is actually consumed.
export {
  SKIP_NOT_SHIPPED,
  SKIP_UNKNOWN_REGISTRY,
  exitCodeFor,
  tallyRegistries,
  type RegistryResult,
  type RegistryStatus,
  type RegistryTally,
} from './summary'
