import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

/**
 * Loads environment variables for a workspace:
 * 1. Loads workspace .env if present
 * 2. Falls back to root .env if variable not set
 *
 * Usage:
 *   loadEnv(__dirname)
 */
export function loadEnv(workspaceDir: string) {
  const rootEnvPath = path.resolve(workspaceDir, '../../.env')
  const workspaceEnvPath = path.resolve(workspaceDir, '.env')

  // Load workspace .env first
  if (fs.existsSync(workspaceEnvPath)) {
    dotenv.config({ path: workspaceEnvPath })
  }

  // Load root .env, but only set variables not already defined
  if (fs.existsSync(rootEnvPath)) {
    const rootVars = dotenv.parse(fs.readFileSync(rootEnvPath))
    for (const [key, value] of Object.entries(rootVars)) {
      if (!process.env[key]) {
        process.env[key] = String(value)
      }
    }
  }
}
