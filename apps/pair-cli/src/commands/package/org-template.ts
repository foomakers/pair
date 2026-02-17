import type { FileSystemService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
import type { OrganizationMetadata } from './metadata'
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

const ORG_TEMPLATE_PATH = '.pair/org-template.json'

/**
 * Load org template from .pair/org-template.json.
 * Returns null if file doesn't exist (template is optional).
 * Throws on malformed JSON.
 */
export async function loadOrgTemplate(
  projectRoot: string,
  fs: FileSystemService,
): Promise<OrgTemplateData | null> {
  const templatePath = path.join(projectRoot, ORG_TEMPLATE_PATH)

  if (!fs.existsSync(templatePath)) {
    return null
  }

  try {
    const content = await fs.readFile(templatePath)
    const parsed = JSON.parse(content) as OrgTemplateData
    logger.info(`Using org template: ${ORG_TEMPLATE_PATH}`)
    return parsed
  } catch (error) {
    throw new Error(
      `Failed to parse org template at ${ORG_TEMPLATE_PATH}: ${error instanceof Error ? error.message : String(error)}`,
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

function withOptional<T>(key: string, value: T | undefined): Record<string, T> {
  return value !== undefined ? { [key]: value } : {}
}

/**
 * Merge org metadata from CLI flags and template.
 * Precedence: CLI flags > org-template > defaults.
 */
export function mergeOrgDefaults(
  cliFlags: OrgCliFlags,
  template: OrgTemplateData | null,
): OrganizationMetadata {
  const t = template ?? {}
  return {
    name: pickFirst(cliFlags.orgName, t.name) ?? '',
    ...withOptional('team', pickFirst(cliFlags.team, t.team)),
    ...withOptional('department', pickFirst(cliFlags.department, t.department)),
    ...withOptional('approver', pickFirst(cliFlags.approver, t.approver)),
    compliance: pickFirst(cliFlags.compliance, t.compliance) ?? [],
    distribution: pickFirst(cliFlags.distribution, t.distribution) ?? 'open',
  }
}
