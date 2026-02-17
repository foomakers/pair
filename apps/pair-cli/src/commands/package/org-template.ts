import type { FileSystemService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
import { createOrganizationMetadata } from './metadata'
import type { DistributionPolicy } from './org-validators'
import path from 'path'

export interface OrgTemplateData {
  name?: string
  team?: string
  department?: string
  approver?: string
  compliance?: string[]
  distribution?: DistributionPolicy
}

/**
 * Load org template from a given path relative to projectRoot.
 * Returns null if file doesn't exist (template is optional).
 * Throws on malformed JSON.
 */
export async function loadOrgTemplate(
  projectRoot: string,
  fs: FileSystemService,
  relativePath: string,
): Promise<OrgTemplateData | null> {
  const templatePath = path.join(projectRoot, relativePath)

  if (!fs.existsSync(templatePath)) {
    return null
  }

  try {
    const content = await fs.readFile(templatePath)
    const parsed = JSON.parse(content) as OrgTemplateData
    logger.info(`Using org template: ${relativePath}`)
    return parsed
  } catch (error) {
    throw new Error(
      `Failed to parse org template at ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

interface OrgCliFlags {
  orgName?: string | undefined
  team?: string | undefined
  department?: string | undefined
  approver?: string | undefined
  compliance?: string[] | undefined
  distribution?: DistributionPolicy | undefined
}

function pickFirst<T>(...values: (T | undefined)[]): T | undefined {
  return values.find(v => v !== undefined)
}

/**
 * Merge org metadata from CLI flags and template.
 * Precedence: CLI flags > org-template > factory defaults.
 */
export function mergeOrgDefaults(
  cliFlags: OrgCliFlags,
  template: OrgTemplateData | null,
): ReturnType<typeof createOrganizationMetadata> {
  const t = template ?? {}
  return createOrganizationMetadata({
    name: pickFirst(cliFlags.orgName, t.name) ?? '',
    team: pickFirst(cliFlags.team, t.team),
    department: pickFirst(cliFlags.department, t.department),
    approver: pickFirst(cliFlags.approver, t.approver),
    compliance: pickFirst(cliFlags.compliance, t.compliance),
    distribution: pickFirst(cliFlags.distribution, t.distribution),
  })
}
