export type Behavior = 'overwrite' | 'add' | 'mirror' | 'skip'

export type TargetMode = 'canonical' | 'symlink' | 'copy'

export type TargetConfig = {
  path: string
  mode: TargetMode
}

export function normalizeKey(p: string) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

export function resolveBehavior(
  relPath: string,
  folderBehavior: Record<string, Behavior> | undefined,
  defaultBehavior: Behavior,
) {
  if (!folderBehavior) return defaultBehavior
  let p = normalizeKey(relPath)
  if (p in folderBehavior) return folderBehavior[p]
  while (p.includes('/')) {
    p = p.slice(0, p.lastIndexOf('/'))
    if (p in folderBehavior) return folderBehavior[p]
  }
  if ('' in folderBehavior) return folderBehavior['']
  return defaultBehavior
}

export function validateMirrorConstraints(
  folderBehavior: Record<string, Behavior> | undefined,
  createError?: (message: string, details: string) => Error,
) {
  if (!folderBehavior) return

  const normalized: Record<string, Behavior> = {}
  for (const k of Object.keys(folderBehavior))
    normalized[normalizeKey(k)] = folderBehavior[k] as Behavior

  const keys = Object.keys(normalized)

  for (const k of keys) {
    if (normalized[k] !== 'mirror') continue
    validateMirrorParentConstraints(k, keys, normalized, createError)
  }
}

function validateMirrorParentConstraints(
  parentKey: string,
  allKeys: string[],
  normalized: Record<string, Behavior>,
  createError?: (message: string, details: string) => Error,
) {
  for (const childKey of allKeys) {
    if (childKey === parentKey) continue
    if (!childKey.startsWith(parentKey + '/')) continue

    if (normalized[childKey] !== 'mirror') {
      const message = `Invalid folderBehavior: parent '${parentKey}' is 'mirror' so descendant '${childKey}' must also be 'mirror'`
      if (createError) {
        throw createError(message, `Parent: ${parentKey}, Child: ${childKey}`)
      } else {
        throw new Error(message)
      }
    }
  }
}

/**
 * Validates target configurations before install/update operations.
 * @param targets - Array of target configurations to validate
 * @param platform - OS platform (defaults to process.platform)
 */
export function validateTargets(targets: TargetConfig[], platform?: string): void {
  if (targets.length === 0) return

  const resolvedPlatform = platform ?? process.platform

  checkDuplicatePaths(targets)

  if (targets.length > 1) {
    checkCanonicalCount(targets)
  }

  checkWindowsSymlink(targets, resolvedPlatform)
}

function checkDuplicatePaths(targets: TargetConfig[]): void {
  const normalized = targets.map(t => normalizeKey(t.path))
  const seen = new Set<string>()
  for (const path of normalized) {
    if (seen.has(path)) {
      throw new Error(`Duplicate target path: '${path}'. Each target must have a unique path.`)
    }
    seen.add(path)
  }
}

function checkCanonicalCount(targets: TargetConfig[]): void {
  const canonicalCount = targets.filter(t => t.mode === 'canonical').length
  if (canonicalCount !== 1) {
    throw new Error(
      `Multiple targets require exactly one canonical target, found ${canonicalCount}.`,
    )
  }
}

function checkWindowsSymlink(targets: TargetConfig[], platform: string): void {
  if (platform !== 'win32') return
  const hasSymlink = targets.some(t => t.mode === 'symlink')
  if (hasSymlink) {
    throw new Error('Windows does not support symlink targets. Use copy mode instead.')
  }
}

export default { normalizeKey, resolveBehavior, validateMirrorConstraints, validateTargets }
