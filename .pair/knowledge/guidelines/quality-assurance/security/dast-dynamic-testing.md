# DAST Dynamic Testing

## 🎯 **PURPOSE**

Dynamic Application Security Testing (DAST) that tests running applications to identify runtime vulnerabilities, configuration issues, and security flaws through automated scanning and manual testing of live applications in test environments.

## 🔍 **DYNAMIC TESTING APPROACH**

### **DAST Testing Strategy**

DAST complements SAST by testing applications during runtime, simulating real-world attacks against deployed applications to identify vulnerabilities that only manifest when the application is running.

#### Key Testing Areas:

- **Authentication & Authorization**: Session management, access controls, privilege escalation
- **Input Validation**: SQL injection, XSS, command injection via live inputs
- **Configuration Security**: Server misconfigurations, exposed endpoints, insecure headers
- **Business Logic**: Workflow bypasses, race conditions, state manipulation

### **DAST Tools Integration**

#### OWASP ZAP Integration

```bash
# Automated ZAP scanning in CI/CD
zap-baseline.py -t $TARGET_URL -J zap-report.json -r zap-report.html

# Full scan with authentication
zap-full-scan.py -t $TARGET_URL -J zap-full.json \
  -z "-config authentication.form.loginurl=$LOGIN_URL"
```

#### Burp Suite Enterprise

```yaml
# CI/CD integration
burp_scan:
  stage: security_test
  script:
    - burp-scanner --url=$TARGET_URL --output=burp-results.json
    - burp-reporter --input=burp-results.json --format=sarif
```

## 🛡️ **VULNERABILITY CATEGORIES**

### **Authentication Testing**

#### Session Management Vulnerabilities

- Session fixation and hijacking
- Insufficient session timeout
- Weak session token generation
- Cross-site request forgery (CSRF)

#### Access Control Testing

- Vertical privilege escalation
- Horizontal privilege escalation
- Forced browsing to restricted areas
- Missing function-level access controls

### **Injection Vulnerabilities**

#### SQL Injection Detection

- Error-based SQL injection
- Blind SQL injection (boolean & time-based)
- NoSQL injection patterns
- ORM injection vulnerabilities

#### Cross-Site Scripting (XSS)

- Stored XSS in user inputs
- Reflected XSS in parameters
- DOM-based XSS vulnerabilities
- CSP bypass techniques

### **Configuration Vulnerabilities**

#### Server Configuration Issues

- Missing security headers (HSTS, CSP, X-Frame-Options)
- Information disclosure in error messages
- Directory traversal vulnerabilities
- Insecure HTTP methods enabled

## 📊 **DAST IMPLEMENTATION**

### **Automated Scanning Pipeline**

#### GitHub Actions DAST Workflow

```yaml
name: DAST Security Scan

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM
  workflow_dispatch:

jobs:
  dast-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Test Environment
        run: |
          echo "Deploying to staging environment..."
          # Deploy application to test environment

      - name: Wait for Application
        run: |
          timeout 300 bash -c 'until curl -f ${{ env.TARGET_URL }}/health; do sleep 5; done'

      - name: Run ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.7.0
        with:
          target: ${{ env.TARGET_URL }}
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'

      - name: Run ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.4.0
        with:
          target: ${{ env.TARGET_URL }}
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'

      - name: Security Gate Check
        run: |
          python scripts/dast-security-gate.py --report zap_report.json
```

### **Manual Testing Framework**

#### Structured Manual Testing

#### Authentication Testing Checklist

- [ ] Test for weak password policies
- [ ] Verify account lockout mechanisms
- [ ] Check for password reset vulnerabilities
- [ ] Test multi-factor authentication bypass
- [ ] Validate session management security

#### Authorization Testing Checklist

- [ ] Test vertical privilege escalation
- [ ] Test horizontal privilege escalation
- [ ] Verify direct object references
- [ ] Test for missing function-level access controls
- [ ] Check for privilege escalation through parameter manipulation

#### Input Validation Testing

- [ ] SQL injection in all input fields
- [ ] XSS in user-controllable inputs
- [ ] Command injection vulnerabilities
- [ ] Path traversal attacks
- [ ] XML/JSON injection testing

## 🎯 **DAST QUALITY GATES**

### **Security Thresholds**

#### Vulnerability Severity Limits

- **Critical**: 0 vulnerabilities allowed
- **High**: Maximum 2 vulnerabilities
- **Medium**: Maximum 10 vulnerabilities
- **Low**: Maximum 25 vulnerabilities

#### False Positive Management

- Maintain verified false positive list
- Regular review of suppressed findings
- Documentation of business risk acceptance
- Automated filtering of known false positives

### **Reporting and Remediation**

#### DAST Report Structure

```json
{
  "scan_info": {
    "target": "https://staging.example.com",
    "scan_type": "full",
    "duration": "45 minutes",
    "coverage": "85%"
  },
  "summary": {
    "critical": 0,
    "high": 1,
    "medium": 5,
    "low": 12,
    "info": 8
  },
  "findings": [
    {
      "severity": "high",
      "type": "sql_injection",
      "url": "/api/users/search",
      "parameter": "query",
      "evidence": "MySQL error message revealed",
      "remediation": "Use parameterized queries"
    }
  ]
}
```

#### Remediation Priorities

1. **Critical/High**: Immediate fix required (1-2 days)
2. **Medium**: Fix within current sprint (1-2 weeks)
3. **Low**: Address in next release cycle (1 month)
4. **Info**: Document and consider for future improvements

---

_DAST provides runtime security validation that complements static analysis, ensuring comprehensive security coverage through live application testing and attack simulation._
