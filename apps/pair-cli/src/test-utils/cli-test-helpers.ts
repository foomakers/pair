import { writeTempConfig, removeTempConfig } from './config-file-helper'

// Execute a callback while a temp config is installed. This helper intentionally
// avoids importing any test runner APIs so it stays safe to compile.
export async function withTempConfig(config: unknown, cb: () => Promise<unknown> | unknown) {
  writeTempConfig(config)
  try {
    return await cb()
  } finally {
    removeTempConfig()
  }
}

export default { withTempConfig }
