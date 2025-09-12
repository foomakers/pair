// Lazy loading for heavy modules to improve startup performance
let remarkParseInstance: unknown = null
let unifiedInstance: unknown = null

/**
 * Gets the remark-parse instance with lazy loading
 */
export async function getRemarkParseInstance() {
  if (!remarkParseInstance) {
    const { default: remarkParse } = await import('remark-parse')
    remarkParseInstance = remarkParse
  }
  return remarkParseInstance
}

/**
 * Gets the unified instance with lazy loading
 */
export async function getUnifiedInstance() {
  if (!unifiedInstance) {
    const { unified } = await import('unified')
    unifiedInstance = unified
  }
  return unifiedInstance
}

/**
 * Loads heavy operations in parallel for better performance
 */
export async function loadHeavyOperations() {
  const [unified, remarkParse] = await Promise.all([import('unified'), import('remark-parse')])
  return [unified, remarkParse]
}

// Lazy loading for file system operations
let fsInstance: typeof import('fs') | null = null
let pathInstance: typeof import('path') | null = null

/**
 * Gets the fs instance with lazy loading
 */
export async function getFsInstance() {
  if (!fsInstance) {
    const fs = await import('fs')
    fsInstance = fs
  }
  return fsInstance
}

/**
 * Gets the path instance with lazy loading
 */
export async function getPathInstance() {
  if (!pathInstance) {
    const path = await import('path')
    pathInstance = path
  }
  return pathInstance
}
