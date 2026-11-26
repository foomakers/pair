/**
 * The body of a level-2 section, as RENDERED markdown: an occurrence inside a fenced code block
 * is not a heading (the schema documents its own declarations inside fences, so a line scan that
 * ignored fences would read a documentation example as a declaration).
 */
export function sectionBodies(markdown: string, heading: string): string[][] {
  const bodies: string[][] = []
  let current: string[] | undefined
  let fenced = false

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      if (current) current.push(raw)
      continue
    }
    if (!fenced && /^##\s+/.test(line)) {
      if (current) bodies.push(current)
      current = line.replace(/^##\s+/, '') === heading ? [] : undefined
      continue
    }
    if (current) current.push(raw)
  }
  if (current) bodies.push(current)
  return bodies
}

const NON_RISK_PROJECTIONS = new Set([
  'cost',
  'light',
  'security-relevance',
  'business-impact',
  'coupling-balance',
  'change-risk',
  'service-criticality',
])

export function riskTagFamily(adoption: string | undefined): string | null | undefined {
  if (adoption === undefined) return undefined
  const markdown = adoption
    .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const projections = sectionBodies(markdown, 'Tag Projection')
  if (projections.length > 1) return null
  const [projection] = projections
  const active = projection?.join('\n').match(/^Active:[ \t]*(.+)$/m)?.[1]
  if (active === undefined) return undefined
  const families = new Set(
    active
      .split(',')
      .map(family => family.trim())
      .filter(Boolean),
  )
  if (families.has('none')) return null
  if (families.has('risk')) return 'risk'
  const renamed = [...families].filter(family => !NON_RISK_PROJECTIONS.has(family))
  return renamed.length === 1 ? renamed[0]! : null
}
