import { readFileSync } from 'fs'
import { join } from 'path'

/** An absent adoption setting leaves local telemetry off. A run flag takes precedence. */
export function telemetryEnabled(root: string, flag?: boolean): boolean {
  if (flag !== undefined) return flag
  let text: string
  try {
    text = readFileSync(join(root, '.pair/adoption/tech/automation.md'), 'utf8')
  } catch {
    return false
  }
  const section = /^## Telemetry\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)?.[1]
  return /^\s*-?\s*enabled:\s*true\s*$/m.test(section ?? '')
}
