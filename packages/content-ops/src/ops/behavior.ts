export type Behavior = 'overwrite' | 'add' | 'mirror' | 'skip'

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

export default { normalizeKey, resolveBehavior, validateMirrorConstraints }
