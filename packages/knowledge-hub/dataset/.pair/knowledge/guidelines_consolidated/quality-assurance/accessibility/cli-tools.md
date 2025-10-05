# CLI Tools for Accessibility Testing

## 🎯 **PURPOSE**

Command-line interface tools for automated accessibility testing, enabling continuous integration, batch processing, and systematic accessibility validation across large-scale web applications and development workflows.

## 🔧 **CORE CLI ACCESSIBILITY TOOLS**

### **axe-core CLI**

**Installation and Setup**

```bash
# Install globally
npm install -g @axe-core/cli

# Or as project dependency
npm install --save-dev @axe-core/cli

# Yarn alternative
yarn add --dev @axe-core/cli
```

**Basic Usage**

```bash
# Scan single URL
axe https://example.com

# Scan multiple URLs
axe https://example.com https://example.com/about https://example.com/contact

# Scan with specific output format
axe https://example.com --format json > accessibility-report.json

# Scan with custom configuration
axe https://example.com --config ./axe-config.json
```

**Advanced Configuration**

```json
{
  "rules": {
    "color-contrast": { "enabled": true },
    "keyboard-navigation": { "enabled": true },
    "aria-labels": { "enabled": true },
    "heading-order": { "enabled": true }
  },
  "tags": ["wcag2a", "wcag2aa", "wcag21aa"],
  "reporter": "html",
  "outputDir": "./accessibility-reports"
}
```

### **Pa11y CLI**

**Installation**

```bash
# Install globally
npm install -g pa11y

# Install with HTML reporter
npm install -g pa11y pa11y-reporter-html

# Install with JSON reporter
npm install -g pa11y pa11y-reporter-json
```

**Testing Capabilities**

```bash
# Basic accessibility scan
pa11y https://example.com

# Scan with specific WCAG level
pa11y https://example.com --standard WCAG2AA

# Scan with custom viewport
pa11y https://example.com --viewport 1280x1024

# Scan with authentication
pa11y https://example.com --cookie "session=abc123"

# Generate HTML report
pa11y https://example.com --reporter html > report.html
```

**Batch Testing**

```bash
# Create URL list file
echo "https://example.com
https://example.com/products
https://example.com/contact
https://example.com/about" > urls.txt

# Run batch testing
while read url; do
  echo "Testing: $url"
  pa11y "$url" --reporter json >> batch-results.json
done < urls.txt
```

### **Lighthouse CLI**

**Accessibility-focused Testing**

```bash
# Install Lighthouse
npm install -g lighthouse

# Run accessibility audit only
lighthouse https://example.com --only-categories=accessibility

# Generate detailed accessibility report
lighthouse https://example.com \
  --only-categories=accessibility \
  --output=json \
  --output-path=./reports/accessibility.json

# Run with custom device simulation
lighthouse https://example.com \
  --only-categories=accessibility \
  --emulated-device=iPhone X
```

**CI/CD Integration**

```bash
# Lighthouse CI configuration
#!/bin/bash
THRESHOLD=90

SCORE=$(lighthouse https://example.com --only-categories=accessibility --output=json | jq '.categories.accessibility.score * 100')

if (( $(echo "$SCORE < $THRESHOLD" | bc -l) )); then
  echo "Accessibility score $SCORE below threshold $THRESHOLD"
  exit 1
else
  echo "Accessibility score $SCORE meets threshold"
  exit 0
fi
```

### **Accessibility Insights CLI**

**Microsoft Accessibility Insights**

```bash
# Install accessibility-insights-scan
npm install -g accessibility-insights-scan

# Scan single page
accessibility-insights-scan --url https://example.com

# Scan with output directory
accessibility-insights-scan \
  --url https://example.com \
  --output ./ai-reports

# Scan with custom settings
accessibility-insights-scan \
  --url https://example.com \
  --output ./reports \
  --max-urls 50 \
  --discovery-patterns "a[href]"
```

## 📋 **WORKFLOW INTEGRATION PATTERNS**

### **Git Hooks Integration**

**Pre-commit Hook**

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running accessibility checks..."

# Check staged files for accessibility issues
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(html|js|jsx|ts|tsx)$')

if [ ! -z "$STAGED_FILES" ]; then
  # Run accessibility checks on changed files
  for file in $STAGED_FILES; do
    if [[ $file == *.html ]]; then
      echo "Checking accessibility for: $file"
      pa11y "file://$PWD/$file" --threshold 5
      if [ $? -ne 0 ]; then
        echo "Accessibility issues found in $file"
        exit 1
      fi
    fi
  done
fi

echo "Accessibility checks passed!"
```

**Pre-push Hook**

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "Running comprehensive accessibility audit..."

# Run accessibility tests on development server
if command -v axe &> /dev/null; then
  axe http://localhost:3000 --threshold 0
  if [ $? -ne 0 ]; then
    echo "Accessibility violations found. Push aborted."
    exit 1
  fi
fi

echo "Pre-push accessibility checks passed!"
```

### **CI/CD Pipeline Integration**

**GitHub Actions Workflow**

```yaml
name: Accessibility Testing

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  accessibility-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm ci
          npm install -g @axe-core/cli pa11y lighthouse

      - name: Build application
        run: npm run build

      - name: Start development server
        run: |
          npm start &
          sleep 30

      - name: Run axe accessibility tests
        run: |
          axe http://localhost:3000 --format json --output-path ./reports/axe-results.json

      - name: Run Pa11y tests
        run: |
          pa11y http://localhost:3000 --reporter json > ./reports/pa11y-results.json

      - name: Run Lighthouse accessibility audit
        run: |
          lighthouse http://localhost:3000 \
            --only-categories=accessibility \
            --output=json \
            --output-path=./reports/lighthouse-results.json

      - name: Upload accessibility reports
        uses: actions/upload-artifact@v3
        with:
          name: accessibility-reports
          path: ./reports/

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const axeResults = JSON.parse(fs.readFileSync('./reports/axe-results.json'));
            const violations = axeResults.violations.length;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Accessibility Test Results\\n\\n**Violations Found:** ${violations}\\n\\nFull reports available in artifacts.`
            });
```

**Jenkins Pipeline**

```groovy
pipeline {
    agent any

    stages {
        stage('Accessibility Testing') {
            steps {
                script {
                    // Install tools
                    sh 'npm install -g @axe-core/cli pa11y'

                    // Run tests
                    sh 'axe http://staging.example.com --format json --output-path axe-results.json'
                    sh 'pa11y http://staging.example.com --reporter json > pa11y-results.json'

                    // Parse results
                    def axeResults = readJSON file: 'axe-results.json'
                    def violations = axeResults.violations.size()

                    if (violations > 0) {
                        currentBuild.result = 'UNSTABLE'
                        echo "Found ${violations} accessibility violations"
                    }
                }
            }

            post {
                always {
                    archiveArtifacts artifacts: '*-results.json', fingerprint: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '.',
                        reportFiles: 'accessibility-report.html',
                        reportName: 'Accessibility Report'
                    ])
                }
            }
        }
    }
}
```

### **Batch Processing Scripts**

**Site-wide Accessibility Audit**

```bash
#!/bin/bash
# site-accessibility-audit.sh

# Configuration
BASE_URL="https://example.com"
OUTPUT_DIR="./accessibility-reports/$(date +%Y-%m-%d)"
URLS_FILE="urls.txt"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate sitemap URLs or use predefined list
if [ ! -f "$URLS_FILE" ]; then
  echo "Generating URL list from sitemap..."
  curl -s "${BASE_URL}/sitemap.xml" | \
    grep -oP '(?<=<loc>)[^<]+' > "$URLS_FILE"
fi

# Function to test single URL
test_url() {
  local url=$1
  local filename=$(echo "$url" | sed 's|https\?://||g' | sed 's|/|_|g')

  echo "Testing: $url"

  # Run multiple tools
  axe "$url" --format json --output-path "$OUTPUT_DIR/axe_${filename}.json"
  pa11y "$url" --reporter json > "$OUTPUT_DIR/pa11y_${filename}.json"
  lighthouse "$url" \
    --only-categories=accessibility \
    --output=json \
    --output-path="$OUTPUT_DIR/lighthouse_${filename}.json"
}

# Export function for parallel execution
export -f test_url
export OUTPUT_DIR

# Run tests in parallel
cat "$URLS_FILE" | xargs -n 1 -P 4 -I {} bash -c 'test_url "{}"'

# Generate summary report
echo "Generating summary report..."
node generate-summary.js "$OUTPUT_DIR" > "$OUTPUT_DIR/summary.html"

echo "Accessibility audit complete. Reports saved to: $OUTPUT_DIR"
```

**Report Generation Script**

```javascript
// generate-summary.js
const fs = require('fs')
const path = require('path')

const reportDir = process.argv[2]
const files = fs.readdirSync(reportDir)

const axeFiles = files.filter(f => f.startsWith('axe_'))
const pa11yFiles = files.filter(f => f.startsWith('pa11y_'))

let totalViolations = 0
let pageResults = []

axeFiles.forEach(file => {
  const results = JSON.parse(fs.readFileSync(path.join(reportDir, file)))
  const violations = results.violations.length
  totalViolations += violations

  pageResults.push({
    url: results.url,
    violations: violations,
    timestamp: results.timestamp,
  })
})

// Generate HTML report
const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Accessibility Audit Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .summary { background: #f5f5f5; padding: 20px; margin-bottom: 20px; }
    .violations-high { color: #d73527; }
    .violations-medium { color: #f57c00; }
    .violations-low { color: #2e7d32; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Accessibility Audit Summary</h1>
  
  <div class="summary">
    <h2>Overview</h2>
    <p><strong>Total Pages Tested:</strong> ${pageResults.length}</p>
    <p><strong>Total Violations:</strong> ${totalViolations}</p>
    <p><strong>Average Violations per Page:</strong> ${(
      totalViolations / pageResults.length
    ).toFixed(2)}</p>
  </div>
  
  <h2>Page Results</h2>
  <table>
    <thead>
      <tr>
        <th>URL</th>
        <th>Violations</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${pageResults
        .map(
          page => `
        <tr>
          <td>${page.url}</td>
          <td class="${
            page.violations > 10
              ? 'violations-high'
              : page.violations > 5
              ? 'violations-medium'
              : 'violations-low'
          }">${page.violations}</td>
          <td>${page.violations === 0 ? '✅ Pass' : '❌ Issues Found'}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>
`

console.log(html)
```

## 📊 **TOOL COMPARISON AND SELECTION**

### **Performance Comparison**

| Tool        | Speed  | Accuracy | WCAG Coverage | CI/CD Ready | Learning Curve |
| ----------- | ------ | -------- | ------------- | ----------- | -------------- |
| axe-core    | Fast   | High     | Comprehensive | ✅          | Low            |
| Pa11y       | Medium | High     | Good          | ✅          | Low            |
| Lighthouse  | Slow   | Medium   | Basic         | ✅          | Medium         |
| AI Insights | Medium | High     | Comprehensive | ✅          | Medium         |

### **Use Case Decision Matrix**

```
Need comprehensive WCAG coverage?
├── Yes: axe-core CLI
└── No: Continue

Need performance integration?
├── Yes: Lighthouse CLI
└── No: Continue

Need simple setup and usage?
├── Yes: Pa11y CLI
└── No: Continue

Need Microsoft ecosystem integration?
├── Yes: Accessibility Insights CLI
└── No: Use axe-core CLI (default choice)
```

### **Cost-Benefit Analysis**

**Free Tools**

- axe-core CLI: Best overall value, industry standard
- Pa11y CLI: Excellent for beginners, straightforward usage
- Lighthouse CLI: Great for holistic testing
- Accessibility Insights: Good Microsoft integration

**Investment Recommendations**

- Start with axe-core CLI for comprehensive coverage
- Add Pa11y for alternative perspective
- Include Lighthouse for performance context
- Consider Accessibility Insights for Windows environments

---

_CLI tools provide the foundation for automated accessibility testing, enabling consistent quality assurance and integration with modern development workflows._
