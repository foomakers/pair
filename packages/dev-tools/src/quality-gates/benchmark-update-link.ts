/**
 * Benchmark update-link — perf gate for the CLI's `update-link` command.
 * Generates synthetic KB fixtures at increasing sizes, runs `update-link
 * --dry-run` against each, and checks the result against hard thresholds
 * (<30,000ms for the "large" KB, >100 links/sec for every size).
 *
 * The LOGIC lives here as individually exported, unit-tested functions (see
 * benchmark-update-link.test.ts) — in particular `evaluateBenchmarkResults`,
 * the pure pass/fail verdict, which is what's most worth unit-testing (it's
 * pure given the numbers). Fixture generation and the actual CLI invocation
 * are thin, injectable functions (mirrors the `exec` injection pattern in
 * code-hygiene-check.ts) so they can be exercised with a fake "measurement"
 * in unit tests without ever running the real CLI. The `main()` block is a
 * thin CLI wrapper run via `ts-node src/benchmark-update-link.ts` (package
 * script `benchmark-update-link`, delegated from the repo-root `test:perf`
 * script). Exit 0 = all targets met, Exit 1 = a hard threshold was missed.
 *
 * REPO_ROOT is resolved from this file's location: packages/dev-tools/src ->
 * packages/dev-tools -> packages -> repo root (up 3).
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const BENCHMARK_DIR = join(REPO_ROOT, '.benchmark-tmp')
const CLI_DIST_PATH = join(REPO_ROOT, 'apps/pair-cli/dist/cli.js')
const REPORT_PATH = join(REPO_ROOT, 'reports/performance/benchmark-report.json')

export interface KBSize {
  name: string
  files: number
  linksPerFile: number
}

// Preserved verbatim from the original script.
export const SIZES: KBSize[] = [
  { name: 'small', files: 10, linksPerFile: 10 },
  { name: 'medium', files: 100, linksPerFile: 20 },
  { name: 'large', files: 500, linksPerFile: 30 },
  { name: 'xlarge', files: 1000, linksPerFile: 50 },
]

// Preserved thresholds from the original script.
export const MAX_LARGE_DURATION_MS = 30_000
export const XLARGE_WARNING_DURATION_MS = 60_000
export const MIN_LINKS_PER_SECOND = 100

export interface BenchmarkResult {
  size: string
  files: number
  linksProcessed: number
  duration: number
  linksPerSecond: number
}

/** Generate a synthetic KB fixture of the given size under `benchmarkDir`; returns its path. */
export function generateTestKB(size: KBSize, benchmarkDir: string = BENCHMARK_DIR): string {
  const testDir = join(benchmarkDir, `test-${size.name}`)
  const kbDir = join(testDir, '.pair')
  mkdirSync(kbDir, { recursive: true })

  // Create mock dataset structure to satisfy KB detection.
  const datasetDir = join(testDir, 'node_modules', '@pair', 'knowledge-hub', 'dataset')
  mkdirSync(datasetDir, { recursive: true })
  writeFileSync(join(datasetDir, '.gitkeep'), '')

  for (let i = 0; i < size.files; i++) {
    const fileName = `doc-${i.toString().padStart(4, '0')}.md`
    const filePath = join(kbDir, fileName)

    let content = `# Document ${i}\n\n`
    for (let j = 0; j < size.linksPerFile; j++) {
      const targetDoc = Math.floor(Math.random() * size.files)
      content += `- [Link ${j}](./doc-${targetDoc.toString().padStart(4, '0')}.md)\n`
    }
    writeFileSync(filePath, content)
  }

  return testDir
}

export type RunCli = (cliPath: string, testDir: string) => void

function defaultRunCli(cliPath: string, testDir: string): void {
  try {
    execSync(`node ${cliPath} update-link --dry-run`, { cwd: testDir, stdio: 'pipe' })
  } catch {
    // Ignore errors — we're measuring performance, not correctness here.
  }
}

/** Measure one size: runs the CLI against a pre-generated fixture and reports throughput. */
export function runBenchmark(
  testDir: string,
  size: KBSize,
  cliPath: string = CLI_DIST_PATH,
  runCli: RunCli = defaultRunCli,
): BenchmarkResult {
  const startTime = Date.now()
  runCli(cliPath, testDir)
  const duration = Date.now() - startTime

  const kbDir = join(testDir, '.pair')
  const files = readdirSync(kbDir).filter(f => f.endsWith('.md')).length
  const linksProcessed = files * size.linksPerFile

  return {
    size: size.name,
    files,
    linksProcessed,
    duration,
    linksPerSecond: Math.round((linksProcessed / duration) * 1000),
  }
}

export interface BenchmarkVerdict {
  pass: boolean
  failures: string[]
  warnings: string[]
}

/**
 * Pure pass/fail verdict over a completed set of benchmark results. Hard
 * requirements (cause `pass: false`): the "large" size must finish under
 * `MAX_LARGE_DURATION_MS`, and every size must sustain at least
 * `MIN_LINKS_PER_SECOND`. The "xlarge" size finishing over
 * `XLARGE_WARNING_DURATION_MS` is a warning only — matches the original
 * script, which never failed the build on it.
 */
export function evaluateBenchmarkResults(
  results: BenchmarkResult[],
  thresholds: {
    maxLargeDurationMs: number
    xlargeWarningDurationMs: number
    minLinksPerSecond: number
  } = {
    maxLargeDurationMs: MAX_LARGE_DURATION_MS,
    xlargeWarningDurationMs: XLARGE_WARNING_DURATION_MS,
    minLinksPerSecond: MIN_LINKS_PER_SECOND,
  },
): BenchmarkVerdict {
  const failures: string[] = []
  const warnings: string[] = []

  const largeTest = results.find(r => r.size === 'large')
  if (largeTest && largeTest.duration > thresholds.maxLargeDurationMs) {
    failures.push(
      `Large KB (${largeTest.linksProcessed} links) took ${largeTest.duration}ms ` +
        `(required: <${thresholds.maxLargeDurationMs}ms)`,
    )
  }

  const xlargeTest = results.find(r => r.size === 'xlarge')
  if (xlargeTest && xlargeTest.duration > thresholds.xlargeWarningDurationMs) {
    warnings.push(
      `XLarge KB (${xlargeTest.linksProcessed} links) took ${xlargeTest.duration}ms ` +
        `(>${thresholds.xlargeWarningDurationMs}ms) — consider optimization for very large KBs`,
    )
  }

  const slowTests = results.filter(r => r.linksPerSecond < thresholds.minLinksPerSecond)
  for (const t of slowTests) {
    failures.push(
      `${t.size}: ${t.linksPerSecond} links/sec (required: >${thresholds.minLinksPerSecond})`,
    )
  }

  return { pass: failures.length === 0, failures, warnings }
}

export interface BenchmarkReport {
  timestamp: string
  system: { platform: string; node: string; arch: string }
  results: BenchmarkResult[]
  summary: { fastest: BenchmarkResult; slowest: BenchmarkResult }
}

/** Build the JSON report shape written to disk (fastest/slowest by links/sec). */
export function buildReport(results: BenchmarkResult[]): BenchmarkReport {
  return {
    timestamp: new Date().toISOString(),
    system: { platform: process.platform, node: process.version, arch: process.arch },
    results,
    summary: {
      fastest: results.reduce((a, b) => (a.linksPerSecond > b.linksPerSecond ? a : b)),
      slowest: results.reduce((a, b) => (a.linksPerSecond < b.linksPerSecond ? a : b)),
    },
  }
}

/** Build the CLI dist bundle if it isn't already present. */
function ensureCliBuilt(): void {
  if (!existsSync(CLI_DIST_PATH)) {
    console.log('Building CLI...')
    execSync('pnpm --filter @pair/pair-cli build', { cwd: REPO_ROOT, stdio: 'inherit' })
  } else {
    console.log('CLI already built, skipping build step')
  }
}

/** Generate a fixture and measure every configured KB size, printing progress as it goes. */
function runAllBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = []
  for (const size of SIZES) {
    console.log(`\nBenchmarking ${size.name} KB...`)
    const testDir = generateTestKB(size)
    const result = runBenchmark(testDir, size)
    results.push(result)

    console.log(`Duration: ${result.duration}ms`)
    console.log(`Speed: ${result.linksPerSecond} links/sec`)
  }
  return results
}

/** Print the pass/fail verdict and set the process exit code accordingly. */
function reportVerdict(verdict: BenchmarkVerdict, report: BenchmarkReport): void {
  for (const w of verdict.warnings) console.warn(`\nWARNING: ${w}`)

  if (!verdict.pass) {
    console.error('\nPERFORMANCE TARGET(S) MISSED:')
    for (const f of verdict.failures) console.error(`  - ${f}`)
    console.error('\nPerformance optimization needed - check:')
    console.error('   - File I/O patterns (async/batch operations)')
    console.error('   - Path resolution caching')
    console.error('   - Markdown parsing efficiency')
    console.error('   - Memory allocation patterns')
    process.exit(1)
  }

  console.log('\nAll performance targets met')
  console.log(
    `   Throughput: ${report.summary.fastest.linksPerSecond} - ${report.summary.slowest.linksPerSecond} links/sec`,
  )
}

/** Thin CLI wrapper: build (if needed), generate fixtures, run, evaluate, print report, set exit code. */
export function main(): void {
  console.log('Starting update-link performance benchmark\n')

  if (existsSync(BENCHMARK_DIR)) rmSync(BENCHMARK_DIR, { recursive: true })
  mkdirSync(BENCHMARK_DIR, { recursive: true })

  ensureCliBuilt()
  const results = runAllBenchmarks()
  rmSync(BENCHMARK_DIR, { recursive: true })

  const report = buildReport(results)
  mkdirSync(join(REPO_ROOT, 'reports/performance'), { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

  console.log('\nBenchmark complete!')
  console.log(`Report: ${REPORT_PATH}`)

  reportVerdict(evaluateBenchmarkResults(results), report)
}

if (require.main === module) {
  main()
}
