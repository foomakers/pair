# SAST Static Testing

## 🎯 **PURPOSE**

Comprehensive Static Application Security Testing (SAST) framework that analyzes source code, bytecode, and application artifacts to identify security vulnerabilities early in the development lifecycle, providing automated security scanning, vulnerability detection, and secure coding guidance integrated into development workflows.

## 🔍 **STATIC ANALYSIS FRAMEWORK**

### **Multi-Language SAST Implementation**

**Comprehensive SAST Engine**

Multi-language SAST implementation includes comprehensive security analysis framework supporting JavaScript, TypeScript, Python, Java, C#, Go, and PHP with integrated vulnerability detection, security rule engine implementation, comprehensive vulnerability database integration, automated report generation, and actionable remediation guidance.

SAST engine architecture includes language-specific scanner modules for comprehensive code analysis, centralized security rule engine for consistent vulnerability detection, vulnerability database integration for threat intelligence, automated report generation with detailed findings, and remediation engine for actionable security improvements.

Codebase scanning process includes automated language detection across source directories, parallel execution of language-specific security scanners, comprehensive vulnerability aggregation with deduplication capabilities, summary generation with severity categorization, and evidence collection for vulnerability validation.

Language scanning execution includes tailored configuration for each programming language, file-specific analysis with security rule application, severity-based filtering for relevant findings, comprehensive rule engine integration, and detailed vulnerability reporting with remediation recommendations.

Vulnerability aggregation includes comprehensive result consolidation from multiple language scanners, intelligent deduplication using vulnerability fingerprinting, severity-based sorting for prioritized remediation, occurrence tracking for widespread vulnerabilities, and comprehensive evidence collection for validation.

Deduplication methodology includes vulnerability type and rule identification, file and line location analysis, similarity detection for related findings, evidence merging for comprehensive coverage, and priority-based ranking for effective remediation planning.

**JavaScript/TypeScript SAST Scanner**

JavaScript security analysis includes comprehensive Abstract Syntax Tree parsing for deep code analysis, security pattern detection across common vulnerability categories, data flow analysis for input validation tracking, and comprehensive vulnerability reporting with actionable remediation guidance.
this.ruleCheckers = [
new XSSVulnerabilityChecker(),
new SQLInjectionChecker(),
new InsecureDesignChecker(),
new CryptographicFailuresChecker(),
new SecurityMisconfigurationChecker(),
new VulnerableComponentsChecker(),
new AuthenticationFailuresChecker(),
new DataIntegrityChecker(),
new LoggingFailuresChecker(),
new ServerSideRequestForgeryChecker(),
]
}

async scan(config) {
const result = {
language: 'javascript',
vulnerabilities: [],
metrics: {},
coverage: {},
}

    for (const file of config.files) {
      try {
        const vulnerabilities = await this.scanFile(file, config)
        result.vulnerabilities.push(...vulnerabilities)
      } catch (error) {
        console.error(`Error scanning ${file}:`, error)
      }
    }

    result.metrics = this.calculateMetrics(result.vulnerabilities)
    result.coverage = this.calculateCoverage(config.files, result.vulnerabilities)

    return result

}

async scanFile(filePath, config) {
const vulnerabilities = []

    try {
      // Parse file into AST
      const code = await this.readFile(filePath)
      const ast = await this.parser.parse(code, filePath)

      // Run security rule checkers
      for (const checker of this.ruleCheckers) {
        const findings = await checker.check(ast, code, filePath, config)
        vulnerabilities.push(...findings)
      }
    } catch (error) {
      vulnerabilities.push({
        type: 'parse_error',
        severity: 'info',
        message: `Failed to parse file: ${error.message}`,
        file: filePath,
        line: 0,
        column: 0,
      })
    }

    return vulnerabilities

}
}

// XSS Vulnerability Checker
class XSSVulnerabilityChecker {
constructor() {
this.dangerousFunctions = [
'innerHTML',
'outerHTML',
'insertAdjacentHTML',
'document.write',
'document.writeln',
'eval',
'Function',
'setTimeout',
'setInterval',
]

    this.domMethods = [
      'createElement',
      'createTextNode',
      'appendChild',
      'insertBefore',
      'replaceChild',
    ]

}

async check(ast, code, filePath, config) {
const vulnerabilities = []

    // AST traversal to find potential XSS vulnerabilities
    this.traverse(ast, node => {
      // Check for dangerous innerHTML usage
      if (this.isDangerousInnerHTML(node)) {
        vulnerabilities.push({
          type: 'xss',
          rule: 'dangerous-innerHTML',
          severity: 'high',
          message: 'Potential XSS vulnerability: unsanitized data in innerHTML',
          file: filePath,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          code: this.extractCode(code, node),
          remediation: 'Use textContent or sanitize HTML before setting innerHTML',
          cwe: 'CWE-79',
          references: ['https://owasp.org/www-community/attacks/xss/'],
        })
      }

      // Check for eval usage
      if (this.isEvalUsage(node)) {
        vulnerabilities.push({
          type: 'code_injection',
          rule: 'eval-usage',
          severity: 'critical',
          message: 'Code injection vulnerability: eval() usage detected',
          file: filePath,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          code: this.extractCode(code, node),
          remediation: 'Avoid eval(). Use JSON.parse() for JSON or implement safe alternatives',
          cwe: 'CWE-94',
          references: ['https://owasp.org/www-community/attacks/Code_Injection'],
        })
      }

      // Check for unsanitized DOM manipulation
      if (this.isDangerousDOMManipulation(node)) {
        vulnerabilities.push({
          type: 'xss',
          rule: 'unsafe-dom-manipulation',
          severity: 'medium',
          message: 'Potential DOM-based XSS: unsanitized DOM manipulation',
          file: filePath,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          code: this.extractCode(code, node),
          remediation: 'Sanitize user input before DOM manipulation',
          cwe: 'CWE-79',
        })
      }
    })

    return vulnerabilities

}

isDangerousInnerHTML(node) {
return (
node.type === 'AssignmentExpression' &&
node.left.type === 'MemberExpression' &&
node.left.property.name === 'innerHTML' &&
this.containsUserInput(node.right)
)
}

isEvalUsage(node) {
return (
(node.type === 'CallExpression' && node.callee.name === 'eval') ||
(node.type === 'NewExpression' && node.callee.name === 'Function')
)
}

containsUserInput(node) {
// Heuristics to detect user input
if (node.type === 'Identifier') {
const suspiciousNames = ['userInput', 'params', 'query', 'body', 'data', 'input']
return suspiciousNames.some(name => node.name.toLowerCase().includes(name.toLowerCase()))
}

    if (node.type === 'MemberExpression') {
      return this.containsUserInput(node.object) || this.containsUserInput(node.property)
    }

    if (node.type === 'BinaryExpression') {
      return this.containsUserInput(node.left) || this.containsUserInput(node.right)
    }

    return false

}

extractCode(sourceCode, node) {
if (!node.loc) return ''

    const lines = sourceCode.split('\n')
    const startLine = node.loc.start.line - 1
    const endLine = node.loc.end.line - 1

    if (startLine === endLine) {
      return lines[startLine]?.substring(node.loc.start.column, node.loc.end.column) || ''
    }

    const extractedLines = []
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      if (i === startLine) {
        extractedLines.push(lines[i].substring(node.loc.start.column))
      } else if (i === endLine) {
        extractedLines.push(lines[i].substring(0, node.loc.end.column))
      } else {
        extractedLines.push(lines[i])
      }
    }

    return extractedLines.join('\n')

}

traverse(node, callback) {
if (!node || typeof node !== 'object') return

    callback(node)

    Object.keys(node).forEach(key => {
      const child = node[key]
      if (Array.isArray(child)) {
        child.forEach(item => this.traverse(item, callback))
      } else if (child && typeof child === 'object') {
        this.traverse(child, callback)
      }
    })

}
}

````

## 🛡️ **SECURITY RULE ENGINE**

### **Comprehensive Security Rules**

**OWASP Top 10 Rule Set**

```javascript
class OWASPTop10RuleSet {
  constructor() {
    this.rules = new Map()
    this.initializeRules()
  }

  initializeRules() {
    // A01:2021 – Broken Access Control
    this.addRule('broken-access-control', {
      category: 'access-control',
      severity: 'high',
      patterns: [
        /\/admin\/.*\$\{.*\}/g, // Path traversal in admin routes
        /req\.user\.role\s*[!=]=?\s*['"](admin|root)['"]/g, // Role-based checks
        /window\.location\.href\s*=.*admin/g, // Client-side admin redirects
      ],
      description: 'Detects potential broken access control vulnerabilities',
      remediation: 'Implement proper authorization checks and principle of least privilege',
    })

    // A02:2021 – Cryptographic Failures
    this.addRule('cryptographic-failures', {
      category: 'cryptography',
      severity: 'high',
      patterns: [
        /crypto\.createHash\(['"]md5['"]\)/g, // Weak hash algorithms
        /crypto\.createHash\(['"]sha1['"]\)/g,
        /Math\.random\(\)/g, // Insecure randomness
        /btoa\(.*password.*\)/g, // Base64 encoding passwords
        /atob\(/g, // Base64 decoding (potential for sensitive data)
      ],
      description: 'Identifies weak cryptographic implementations',
      remediation: 'Use strong cryptographic algorithms and secure random number generators',
    })

    // A03:2021 – Injection
    this.addRule('injection-vulnerabilities', {
      category: 'injection',
      severity: 'critical',
      patterns: [
        /SELECT.*\+.*req\./g, // SQL injection patterns
        /INSERT.*\+.*req\./g,
        /UPDATE.*\+.*req\./g,
        /DELETE.*\+.*req\./g,
        /eval\(.*req\./g, // Code injection
        /Function\(.*req\./g,
        /exec\(.*req\./g, // Command injection
      ],
      description: 'Detects injection vulnerability patterns',
      remediation: 'Use parameterized queries and input validation',
    })

    // A04:2021 – Insecure Design
    this.addRule('insecure-design', {
      category: 'design',
      severity: 'medium',
      patterns: [
        /password.*===.*['"]/g, // Hardcoded password comparisons
        /api[_-]?key.*=.*['"]/g, // Hardcoded API keys
        /secret.*=.*['"]/g, // Hardcoded secrets
        /token.*=.*['"]/g, // Hardcoded tokens
      ],
      description: 'Identifies insecure design patterns',
      remediation: 'Implement secure-by-design principles and remove hardcoded secrets',
    })

    // A05:2021 – Security Misconfiguration
    this.addRule('security-misconfiguration', {
      category: 'configuration',
      severity: 'medium',
      patterns: [
        /app\.use\(cors\(\)\)/g, // Permissive CORS
        /helmet\(\).*\{.*frameGuard.*false/g, // Disabled security headers
        /process\.env\.NODE_ENV.*===.*['"]development['"]/g, // Production checks
        /console\.log\(.*password.*\)/g, // Logging sensitive data
      ],
      description: 'Detects security misconfigurations',
      remediation: 'Review and harden security configurations',
    })

    // A06:2021 – Vulnerable and Outdated Components
    this.addRule('vulnerable-components', {
      category: 'dependencies',
      severity: 'high',
      files: ['package.json', 'package-lock.json', 'yarn.lock'],
      description: 'Identifies known vulnerable dependencies',
      remediation: 'Update vulnerable dependencies to secure versions',
    })

    // A07:2021 – Identification and Authentication Failures
    this.addRule('auth-failures', {
      category: 'authentication',
      severity: 'high',
      patterns: [
        /session\.save\(\)/g, // Session handling issues
        /bcrypt\.compare\(.*,.*\).*===.*true/g, // Insecure password comparison
        /jwt\.sign\(.*\{.*expiresIn.*['"]\d+['"]/g, // JWT without expiration
        /passport\.authenticate.*\{.*session.*false/g, // Disabled session security
      ],
      description: 'Detects authentication and session management issues',
      remediation: 'Implement secure authentication and session management',
    })

    // A08:2021 – Software and Data Integrity Failures
    this.addRule('integrity-failures', {
      category: 'integrity',
      severity: 'medium',
      patterns: [
        /npm.*install.*--save.*\^/g, // Loose version constraints
        /script.*src.*http:\/\//g, // Insecure script loading
        /\.innerHTML.*=.*http/g, // Remote content injection
        /fetch\(.*http:\/\//g, // Insecure fetch requests
      ],
      description: 'Identifies software and data integrity issues',
      remediation: 'Use integrity checks and secure update mechanisms',
    })

    // A09:2021 – Security Logging and Monitoring Failures
    this.addRule('logging-failures', {
      category: 'logging',
      severity: 'low',
      patterns: [
        /catch.*\{.*\}/g, // Empty catch blocks
        /\.catch\(\)/g, // Unhandled promise rejections
        /console\.error\(/g, // Basic error logging
        /throw.*Error\(/g, // Generic error throwing
      ],
      description: 'Detects insufficient logging and monitoring',
      remediation: 'Implement comprehensive security logging and monitoring',
    })

    // A10:2021 – Server-Side Request Forgery (SSRF)
    this.addRule('ssrf-vulnerabilities', {
      category: 'ssrf',
      severity: 'high',
      patterns: [
        /fetch\(.*req\./g, // Fetch with user input
        /axios\.(get|post|put|delete)\(.*req\./g, // Axios with user input
        /http\.request\(.*req\./g, // HTTP request with user input
        /url.*=.*req\./g, // URL from user input
      ],
      description: 'Detects Server-Side Request Forgery vulnerabilities',
      remediation: 'Validate and sanitize URLs, implement allowlists',
    })
  }

  addRule(name, rule) {
    this.rules.set(name, {
      name,
      ...rule,
      created: new Date(),
    })
  }

  getRulesForLanguage(language) {
    return Array.from(this.rules.values()).filter(
      rule => !rule.language || rule.language === language,
    )
  }

  async checkRule(rule, code, filePath) {
    const violations = []

    if (rule.patterns) {
      rule.patterns.forEach(pattern => {
        let match
        while ((match = pattern.exec(code)) !== null) {
          const lineNumber = this.getLineNumber(code, match.index)
          const columnNumber = this.getColumnNumber(code, match.index)

          violations.push({
            rule: rule.name,
            type: rule.category,
            severity: rule.severity,
            message: `${rule.description}: ${match[0]}`,
            file: filePath,
            line: lineNumber,
            column: columnNumber,
            code: match[0],
            remediation: rule.remediation,
            cwe: rule.cwe,
            references: rule.references,
          })
        }
      })
    }

    return violations
  }

  getLineNumber(code, index) {
    return code.substring(0, index).split('\n').length
  }

  getColumnNumber(code, index) {
    const lines = code.substring(0, index).split('\n')
    return lines[lines.length - 1].length + 1
  }
}
````

## 📊 **SAST INTEGRATION & REPORTING**

### **CI/CD Integration**

**GitHub Actions SAST Workflow**

```yaml
name: SAST Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  sast-scan:
    runs-on: ubuntu-latest

    permissions:
      security-events: write
      actions: read
      contents: read

    steps:

      - uses: actions/checkout@v3

        with:
          fetch-depth: 0

      - name: Setup Node.js

        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies

        run: npm ci

      - name: Run SAST Analysis

        run: |
          npm run security:sast
        env:
          SARIF_OUTPUT: true

      - name: Upload SARIF results

        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: security-results.sarif

      - name: Security Quality Gate

        run: |
          node scripts/security-gate.js
        env:
          MAX_CRITICAL: 0
          MAX_HIGH: 5
          MAX_MEDIUM: 20

      - name: Comment PR with Results

        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('./sast-results.json'));

            const comment = `## 🔒 SAST Security Scan Results

            **Status**: ${results.passed ? '✅ PASSED' : '❌ FAILED'}
            **Scan Duration**: ${results.duration}ms

            ### Vulnerability Summary

            - **Critical**: ${results.summary.critical} 🔴
            - **High**: ${results.summary.high} 🟠
            - **Medium**: ${results.summary.medium} 🟡
            - **Low**: ${results.summary.low} 🟢

            ${results.summary.critical > 0 ? '### ❌ Critical Issues Must Be Fixed\n' + results.criticalIssues.map(i => `- ${i.message} (${i.file}:${i.line})`).join('\n') : ''}

            ### 📈 Security Metrics

            - **Files Scanned**: ${results.metrics.filesScanned}
            - **Lines of Code**: ${results.metrics.linesOfCode}
            - **Security Coverage**: ${results.metrics.coverage}%

            ${results.recommendations.length > 0 ? '### 💡 Recommendations\n' + results.recommendations.slice(0, 5).map(r => `- ${r}`).join('\n') : ''}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

**SARIF Report Generation**

```javascript
class SARIFReportGenerator {
  constructor() {
    this.version = '2.1.0'
    this.schema =
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json'
  }

  generate(scanResults) {
    const sarif = {
      $schema: this.schema,
      version: this.version,
      runs: [
        {
          tool: {
            driver: {
              name: 'Custom SAST Scanner',
              version: '1.0.0',
              informationUri: 'https://example.com/sast-scanner',
              rules: this.generateRules(scanResults.rules),
            },
          },
          results: this.generateResults(scanResults.vulnerabilities),
          columnKind: 'utf16CodeUnits',
        },
      ],
    }

    return sarif
  }

  generateRules(rules) {
    return rules.map(rule => ({
      id: rule.name,
      name: rule.name,
      shortDescription: {
        text: rule.description,
      },
      fullDescription: {
        text: rule.description,
      },
      defaultConfiguration: {
        level: this.mapSeverityToLevel(rule.severity),
      },
      help: {
        text: rule.remediation,
        markdown: rule.remediation,
      },
      properties: {
        category: rule.category,
        cwe: rule.cwe,
      },
    }))
  }

  generateResults(vulnerabilities) {
    return vulnerabilities.map(vuln => ({
      ruleId: vuln.rule,
      level: this.mapSeverityToLevel(vuln.severity),
      message: {
        text: vuln.message,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: vuln.file,
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: vuln.line,
              startColumn: vuln.column,
              snippet: {
                text: vuln.code,
              },
            },
          },
        },
      ],
      fixes: vuln.remediation
        ? [
            {
              description: {
                text: vuln.remediation,
              },
            },
          ]
        : undefined,
    }))
  }

  mapSeverityToLevel(severity) {
    const mapping = {
      critical: 'error',
      high: 'error',
      medium: 'warning',
      low: 'note',
      info: 'note',
    }
    return mapping[severity.toLowerCase()] || 'warning'
  }
}
```

---

_SAST static testing provides comprehensive source code security analysis, enabling early detection of vulnerabilities and integration of security validation into development workflows._
