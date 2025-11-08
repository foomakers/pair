# Update-Link Performance Benchmark Report

## Overview

Performance benchmarks for the `pair update-link` command across different Knowledge Base sizes.

## Performance Target

**Requirement**: Process 1000+ links within 30 seconds

## Test Methodology

### Benchmark Scenarios

1. **Small KB**: 10 files × 10 links/file = 100 links
2. **Medium KB**: 100 files × 20 links/file = 2,000 links
3. **Large KB**: 500 files × 30 links/file = 15,000 links
4. **XLarge KB**: 1,000 files × 50 links/file = 50,000 links

### Test Environment

- **Command**: `pair update-link --dry-run`
- **Platform**: Ubuntu/macOS (CI/local)
- **Node.js**: v18+
- **Operation**: Link validation, path resolution, conversion analysis

### Test Data Generation

Each benchmark generates a synthetic KB with:
- Markdown files with headers and content
- Random internal links between documents
- Mix of relative path references
- Realistic file structure

## Running Benchmarks

### Local Execution

```bash
# Run full benchmark suite
node scripts/perf/benchmark-update-link.js

# Benchmark output
# - Console: Real-time progress and results
# - JSON: docs/performance/benchmark-report.json
```

### CI Execution

Benchmarks run automatically on:
- Push to `main` branch
- Push to `feature/US-69-*` branches
- Pull requests modifying update-link code

Results uploaded as artifacts in GitHub Actions.

## Latest Results

> **Note**: Run `node scripts/perf/benchmark-update-link.js` to generate current results.

Results are stored in `benchmark-report.json` with structure:

```json
{
  "timestamp": "2025-11-08T...",
  "system": {
    "platform": "darwin|linux",
    "node": "v18.x.x",
    "arch": "x64|arm64"
  },
  "results": [
    {
      "size": "small|medium|large|xlarge",
      "files": 10,
      "linksProcessed": 100,
      "duration": 250,
      "linksPerSecond": 400
    }
  ],
  "summary": {
    "fastest": { "size": "small", "linksPerSecond": 500 },
    "slowest": { "size": "xlarge", "linksPerSecond": 200 }
  }
}
```

## Performance Analysis

### Expected Characteristics

- **Scalability**: Linear scaling with link count
- **Memory**: O(n) where n = total links
- **Speed**: 100+ links/second minimum
- **Threshold**: <30s for 1000+ links (target met)

### Performance Factors

1. **File I/O**: Async file reading/writing
2. **Parsing**: Markdown AST generation
3. **Path Resolution**: Root detection and conversions
4. **Validation**: File existence checks

### Optimization Notes

- In-memory caching for root detection
- Batch file operations where possible
- Streaming for large files
- Minimal disk writes in dry-run mode

## Interpreting Results

### Success Criteria

✅ **Pass**: Large test (1000+ links) completes in <30 seconds  
❌ **Fail**: Large test exceeds 30 seconds

### Performance Degradation

If benchmarks show degradation:
1. Check recent code changes in affected modules
2. Profile with `node --prof` for hotspots
3. Review file I/O patterns
4. Validate caching effectiveness

## Related Documentation

- [Update-Link Usage Guide](../getting-started/05-cli-update-link.md)
- [CLI Workflows](../getting-started/02-cli-workflows.md)
- [Release Notes](../RELEASE.md)
