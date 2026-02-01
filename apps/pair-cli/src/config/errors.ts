/**
 * Base class for all environment bootstrap failures.
 */
export class BootstrapError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'BootstrapError'
    // Ensure the prototype is set correctly for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when the Knowledge Hub dataset folder cannot be found.
 */
export class DatasetNotFoundError extends BootstrapError {
  constructor(path: string) {
    super(`Knowledge Hub dataset folder not found at: ${path}`)
    this.name = 'DatasetNotFoundError'
  }
}

/**
 * Thrown when the dataset folder exists but is not readable.
 */
export class DatasetAccessError extends BootstrapError {
  constructor(path: string, cause?: unknown) {
    super(`Knowledge Hub dataset folder is not readable: ${path}`, cause)
    this.name = 'DatasetAccessError'
  }
}

/**
 * Thrown when KB setup (download, cache, extraction) fails.
 */
export class KnowledgeHubSetupError extends BootstrapError {
  constructor(message: string, cause?: unknown) {
    super(`Failed to ensure Knowledge Hub availability: ${message}`, cause)
    this.name = 'KnowledgeHubSetupError'
  }
}
