import type { FileSystemService } from '@pair/content-ops'

/**
 * Metadata validation result
 */
export interface MetadataValidationResult {
  file: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Options for metadata validation
 */
export interface MetadataValidationOptions {
  baseDir: string
  skillFiles: string[]
  adoptionFiles: string[]
  fs: FileSystemService
}

/**
 * Required frontmatter fields for SKILL.md files (per agent skills spec)
 */
const REQUIRED_SKILL_FRONTMATTER_FIELDS = ['name', 'description'] as const

/**
 * Recommended (but optional) frontmatter fields for SKILL.md files
 */
const RECOMMENDED_SKILL_FRONTMATTER_FIELDS = ['version', 'author'] as const

/**
 * Validates metadata in skills and adoption files
 * @param options - Validation options
 * @returns Validation results per file
 */
export async function validateMetadata(
  options: MetadataValidationOptions,
): Promise<MetadataValidationResult[]> {
  const { skillFiles, adoptionFiles, fs } = options

  const results: MetadataValidationResult[] = []

  // Validate skill files
  for (const file of skillFiles) {
    const result = await validateSkillFile(file, fs)
    results.push(result)
  }

  // Validate adoption files
  for (const file of adoptionFiles) {
    const result = await validateAdoptionFile(file, fs)
    results.push(result)
  }

  return results
}

/**
 * Validates a SKILL.md file for required frontmatter
 */
async function validateSkillFile(
  file: string,
  fs: FileSystemService,
): Promise<MetadataValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Read file content
  const content = await fs.readFile(file)

  // Extract frontmatter
  const frontmatter = extractFrontmatter(content)

  if (!frontmatter) {
    errors.push('Missing frontmatter section')
    return { file, valid: false, errors, warnings }
  }

  // Check required fields
  for (const field of REQUIRED_SKILL_FRONTMATTER_FIELDS) {
    if (!frontmatter[field]) {
      errors.push(`Missing required frontmatter field: ${field}`)
    }
  }

  // Check recommended fields
  for (const field of RECOMMENDED_SKILL_FRONTMATTER_FIELDS) {
    if (!frontmatter[field]) {
      warnings.push(`Missing recommended frontmatter field: ${field}`)
    }
  }

  return {
    file,
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validates an adoption file for placeholder content
 */
async function validateAdoptionFile(
  file: string,
  fs: FileSystemService,
): Promise<MetadataValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Read file content
  const content = await fs.readFile(file)

  // Check for placeholder markers
  const placeholderRegex = /\[placeholder\]/gi
  const matches = content.match(placeholderRegex)

  if (matches && matches.length > 0) {
    warnings.push(`Contains ${matches.length} unpopulated placeholder(s)`)
  }

  return {
    file,
    valid: true, // Placeholders are warnings, not errors
    errors,
    warnings,
  }
}

/**
 * Extracts YAML frontmatter from markdown content
 * Frontmatter must be at the start of the file, delimited by ---
 */
function extractFrontmatter(content: string): Record<string, string> | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/
  const match = content.match(frontmatterRegex)

  if (!match || !match[1]) {
    return null
  }

  const frontmatterText = match[1]
  const frontmatter: Record<string, string> = {}

  // Parse simple YAML (key: value pairs)
  const lines = frontmatterText.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      if (key && value) {
        frontmatter[key] = value
      }
    }
  }

  return frontmatter
}
