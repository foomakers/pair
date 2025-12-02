function stripLeadingV(v: string): string {
  return v.startsWith('v') ? v.slice(1) : v
}

export function announceDownload(version: string, url: string): void {
  const clean = stripLeadingV(version)
  if (String(url).includes('github.com')) {
    console.log(`KB not found, downloading v${clean} from GitHub`)
    return
  }

  console.log(`KB not found, downloading v${clean} from ${url}...`)
}

export function announceSuccess(version: string, cachePath: string): void {
  const clean = stripLeadingV(version)
  console.log(`✅ KB v${clean} installed at ${cachePath}`)
}
