import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

export function writeTempConfig(config: unknown, fileName = 'pair.config.json') {
  const path = join(process.cwd(), fileName)
  writeFileSync(path, JSON.stringify(config))
  return path
}

export function removeTempConfig(fileName = 'pair.config.json') {
  try {
    unlinkSync(join(process.cwd(), fileName))
  } catch {
    /* ignore */
  }
}

export default { writeTempConfig, removeTempConfig }
