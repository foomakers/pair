import { logger } from '@pair/content-ops'

function stripLeadingV(v: string): string {
  return v.startsWith('v') ? v.slice(1) : v
}

export function announceDownload(version: string, url: string): void {
  const clean = stripLeadingV(version)
  if (String(url).includes('github.com')) {
    logger.info(`KB not found, downloading v${clean} from GitHub`)
    return
  }

  logger.info(`KB not found, downloading v${clean} from ${url}...`)
}

export function announceSuccess(version: string, cachePath: string): void {
  const clean = stripLeadingV(version)
  logger.info(`✅ KB v${clean} installed at ${cachePath}`)
}
