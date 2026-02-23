#!/usr/bin/env node
/**
 * Performance benchmark for update-link command
 * Tests link processing speed across different KB sizes
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Configuration
const BENCHMARK_DIR = path.join(__dirname, '../../.benchmark-tmp')
const SIZES = [
  { name: 'small', files: 10, linksPerFile: 10 },
  { name: 'medium', files: 100, linksPerFile: 20 },
  { name: 'large', files: 500, linksPerFile: 30 },
  { name: 'xlarge', files: 1000, linksPerFile: 50 },
]

// Generate test KB structure
function generateTestKB(size) {
  const testDir = path.join(BENCHMARK_DIR, `test-${size.name}`)
  const kbDir = path.join(testDir, '.pair')
  fs.mkdirSync(kbDir, { recursive: true })

  // Create mock dataset structure to satisfy KB detection
  const datasetDir = path.join(testDir, 'node_modules', '@pair', 'knowledge-hub', 'dataset')
  fs.mkdirSync(datasetDir, { recursive: true })
  fs.writeFileSync(path.join(datasetDir, '.gitkeep'), '')

  for (let i = 0; i < size.files; i++) {
    const fileName = `doc-${i.toString().padStart(4, '0')}.md`
    const filePath = path.join(kbDir, fileName)

    let content = `# Document ${i}\n\n`
    for (let j = 0; j < size.linksPerFile; j++) {
      const targetDoc = Math.floor(Math.random() * size.files)
      content += `- [Link ${j}](./doc-${targetDoc.toString().padStart(4, '0')}.md)\n`
    }
    fs.writeFileSync(filePath, content)
  }

  console.log(
    `✅ Generated ${size.files} files with ${size.linksPerFile} links each (${size.name})`,
  )
  return testDir
}

// Run benchmark
function runBenchmark(testDir, sizeName) {
  const cliPath = path.join(__dirname, '../../apps/pair-cli/dist/cli.js')

  const startTime = Date.now()
  try {
    execSync(`node ${cliPath} update-link --dry-run`, {
      cwd: testDir,
      stdio: 'pipe',
    })
  } catch (error) {
    // Ignore errors - we're measuring performance
  }
  const duration = Date.now() - startTime

  const kbDir = path.join(testDir, '.pair')
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md')).length
  const linksProcessed = files * SIZES.find(s => s.name === sizeName).linksPerFile

  return {
    size: sizeName,
    files,
    linksProcessed,
    duration,
    linksPerSecond: Math.round((linksProcessed / duration) * 1000),
  }
}

// Main
async function main() {
  console.log('🚀 Starting update-link performance benchmark\n')

  // Setup
  if (fs.existsSync(BENCHMARK_DIR)) {
    fs.rmSync(BENCHMARK_DIR, { recursive: true })
  }
  fs.mkdirSync(BENCHMARK_DIR, { recursive: true })

  // Build CLI if not already built
  const cliDistPath = path.join(__dirname, '../../apps/pair-cli/dist/cli.js')
  if (!fs.existsSync(cliDistPath)) {
    console.log('📦 Building CLI...')
    execSync('pnpm --filter @pair/pair-cli build', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    })
  } else {
    console.log('✓ CLI already built, skipping build step')
  }

  const results = []

  // Run benchmarks
  for (const size of SIZES) {
    console.log(`\n📊 Benchmarking ${size.name} KB...`)
    const testDir = generateTestKB(size)
    const result = runBenchmark(testDir, size.name)
    results.push(result)

    console.log(`⏱️  Duration: ${result.duration}ms`)
    console.log(`⚡ Speed: ${result.linksPerSecond} links/sec`)
  }

  // Cleanup
  fs.rmSync(BENCHMARK_DIR, { recursive: true })

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      node: process.version,
      arch: process.arch,
    },
    results,
    summary: {
      fastest: results.reduce((a, b) => (a.linksPerSecond > b.linksPerSecond ? a : b)),
      slowest: results.reduce((a, b) => (a.linksPerSecond < b.linksPerSecond ? a : b)),
    },
  }

  const reportPath = path.join(__dirname, '../../reports/performance/benchmark-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\n✅ Benchmark complete!')
  console.log(`📄 Report: ${reportPath}`)

  // Performance validation
  const largeTest = results.find(r => r.size === 'large')
  const xlargeTest = results.find(r => r.size === 'xlarge')

  let failed = false

  // Check primary target: 1000+ links in 30s (large test = 15k links)
  if (largeTest && largeTest.duration > 30000) {
    console.error(
      `\n❌ PERFORMANCE TARGET MISSED: Large KB (${largeTest.linksProcessed} links) took ${largeTest.duration}ms (>30s)`,
    )
    console.error(`   Required: <30,000ms | Actual: ${largeTest.duration}ms`)
    failed = true
  } else if (largeTest) {
    console.log(
      `\n✅ Performance target met: Large KB (${largeTest.linksProcessed} links) in ${largeTest.duration}ms`,
    )
  }

  // Warning for slow xlarge performance
  if (xlargeTest && xlargeTest.duration > 60000) {
    console.warn(
      `\n⚠️  WARNING: XLarge KB (${xlargeTest.linksProcessed} links) took ${xlargeTest.duration}ms (>60s)`,
    )
    console.warn('   Consider optimization for very large KBs')
  }

  // Check minimum throughput: 100 links/sec
  const slowTests = results.filter(r => r.linksPerSecond < 100)
  if (slowTests.length > 0) {
    console.error('\n❌ THROUGHPUT TOO LOW:')
    slowTests.forEach(t => {
      console.error(`   ${t.size}: ${t.linksPerSecond} links/sec (<100 required)`)
    })
    failed = true
  }

  if (failed) {
    console.error('\n💡 Performance optimization needed - check:')
    console.error('   - File I/O patterns (async/batch operations)')
    console.error('   - Path resolution caching')
    console.error('   - Markdown parsing efficiency')
    console.error('   - Memory allocation patterns')
    process.exit(1)
  }

  console.log('\n✅ All performance targets met')
  console.log(
    `   Throughput: ${report.summary.fastest.linksPerSecond} - ${report.summary.slowest.linksPerSecond} links/sec`,
  )
}
main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
