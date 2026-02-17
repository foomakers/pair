const VALID_DISTRIBUTION_POLICIES = ['open', 'private', 'restricted'] as const

export type DistributionPolicy = (typeof VALID_DISTRIBUTION_POLICIES)[number]

/**
 * Validate distribution policy value.
 * Throws if not a valid policy.
 */
export function validateDistributionPolicy(value: string): DistributionPolicy {
  if (!VALID_DISTRIBUTION_POLICIES.includes(value as DistributionPolicy)) {
    throw new Error(
      `Invalid distribution policy '${value}'. Valid values: ${VALID_DISTRIBUTION_POLICIES.join(', ')}`,
    )
  }
  return value as DistributionPolicy
}

/**
 * Parse comma-separated compliance tags into trimmed array.
 * Empty/whitespace-only tags are filtered out.
 */
export function parseComplianceTags(input: string): string[] {
  if (!input || !input.trim()) return []
  return input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}

/**
 * Validate organization name is non-empty.
 * Throws if empty or whitespace-only.
 */
export function validateOrgName(name: string | undefined): void {
  if (!name || !name.trim()) {
    throw new Error('Organization name cannot be empty')
  }
}
