import { test as base } from '@playwright/experimental-ct-react'
import AxeBuilder from '@axe-core/playwright'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type Violation = AxeResults['violations'][number]

const IMPACT_ICON: Record<string, string> = {
  critical: '\u274c',
  serious: '\u26a0\ufe0f',
  moderate: '\u2139\ufe0f',
  minor: '\ud83d\udca1',
}

interface ReportEntry {
  label: string
  total: number
  critical: number
  serious: number
  moderate: number
  minor: number
}

export const summary: ReportEntry[] = []

function logViolations(label: string, violations: Violation[]) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of violations) {
    const imp = (v.impact ?? 'minor') as keyof typeof counts
    if (imp in counts) counts[imp]++
  }
  summary.push({ label, total: violations.length, ...counts })

  if (violations.length === 0) {
    console.log(`\u2705 ${label}: no violations`)
    return
  }
  console.log(`\n${'='.repeat(60)}`)
  console.log(`${label} — ${violations.length} violation(s)`)
  console.log('='.repeat(60))
  for (const v of violations) {
    const icon = IMPACT_ICON[v.impact ?? 'minor'] ?? ''
    console.log(`\n${icon} [${v.impact}] ${v.id}`)
    console.log(`   ${v.help}`)
    console.log(`   ${v.helpUrl}`)
    for (const node of v.nodes) {
      console.log(`   -> ${node.html}`)
      for (const fix of node.any ?? []) console.log(`      fix: ${fix.message}`)
      for (const fix of node.all ?? []) console.log(`      fix: ${fix.message}`)
    }
  }
  console.log('')
}

export function printSummary() {
  const W = { label: 28, total: 5, crit: 4, ser: 4, mod: 4, min: 4 }
  const line = '-'.repeat(W.label + W.total + W.crit + W.ser + W.mod + W.min + 17)

  console.log(`\n${line}`)
  console.log(
    `| ${'Component'.padEnd(W.label)} | ${'Tot'.padStart(W.total)} | ${'\u274c'.padStart(W.crit)} | ${'\u26a0\ufe0f'.padStart(W.ser)} | ${'\u2139\ufe0f'.padStart(W.mod)} | ${'\ud83d\udca1'.padStart(W.min)} |`,
  )
  console.log(
    `|${'-'.repeat(W.label + 2)}|${'-'.repeat(W.total + 2)}|${'-'.repeat(W.crit + 2)}|${'-'.repeat(W.ser + 2)}|${'-'.repeat(W.mod + 2)}|${'-'.repeat(W.min + 2)}|`,
  )

  let totalAll = 0
  let clean = 0
  for (const r of summary) {
    totalAll += r.total
    if (r.total === 0) clean++
    console.log(
      `| ${r.label.padEnd(W.label)} | ${String(r.total).padStart(W.total)} | ${String(r.critical).padStart(W.crit)} | ${String(r.serious).padStart(W.ser)} | ${String(r.moderate).padStart(W.mod)} | ${String(r.minor).padStart(W.min)} |`,
    )
  }

  console.log(line)
  console.log(`\n${clean}/${summary.length} clean | ${totalAll} total violation(s)`)
  console.log(
    `Legend: \u274c critical  \u26a0\ufe0f serious  \u2139\ufe0f moderate  \ud83d\udca1 minor\n`,
  )
}

export const test = base.extend<{
  runA11yReport: (label: string) => Promise<AxeResults>
}>({
  runA11yReport: async ({ page }, use) => {
    await use(async (label: string) => {
      const results = await new AxeBuilder({ page })
        .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
        .analyze()

      await test.info().attach(`axe-${label}.json`, {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
      })

      logViolations(label, results.violations)

      return results
    })
  },
})
