# Secure Development Practices

## 🎯 **PURPOSE**

Comprehensive framework for integrating security into every phase of the software development lifecycle, establishing secure coding standards, and ensuring security-first mindset across development teams.

## 🔒 **SECURE DEVELOPMENT LIFECYCLE (SDL)**

### **Security-First Development Framework**

**SDL Integration Points**

- **Planning**: Security requirements gathering and threat modeling
- **Design**: Security architecture and control design
- **Implementation**: Secure coding practices and standards
- **Testing**: Security testing and validation
- **Deployment**: Secure configuration and monitoring
- **Maintenance**: Security updates and incident response

### **Development Phase Security Gates**

| Phase    | Security Activities                    | Deliverables                    | Gate Criteria              |
| -------- | -------------------------------------- | ------------------------------- | -------------------------- |
| Planning | Threat modeling, security requirements | Security requirements doc       | Requirements approved      |
| Design   | Security architecture review           | Security design doc             | Architecture approved      |
| Code     | Secure coding, SAST scanning           | Secure code + scan results      | 0 critical vulnerabilities |
| Test     | Security testing, DAST scanning        | Test results + penetration test | Security tests pass        |
| Deploy   | Security config, monitoring setup      | Deployment checklist            | Security controls active   |

## 👨‍💻 **SECURE CODING STANDARDS**

### **Input Validation & Sanitization**

**Always Validate and Sanitize User Input**

```javascript
// ✅ Secure input validation
function processUserInput(userInput) {
  // 1. Validate input format
  if (!isValidFormat(userInput)) {
    throw new ValidationError('Invalid input format')
  }

  // 2. Sanitize input
  const sanitized = sanitizeInput(userInput)

  // 3. Apply business logic validation
  if (!isBusinessValid(sanitized)) {
    throw new BusinessError('Input violates business rules')
  }

  return sanitized
}

// Input validation utility
function isValidFormat(input) {
  const allowedPattern = /^[a-zA-Z0-9\s\-_\.]{1,100}$/
  return allowedPattern.test(input)
}

function sanitizeInput(input) {
  return input
    .trim()
    .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
    .substring(0, 100) // Limit length
}
```

**SQL Injection Prevention**

```javascript
// ✅ Secure database queries with parameterized statements
async function getUserById(userId) {
  // Use parameterized queries, never string concatenation
  const query = 'SELECT * FROM users WHERE id = ?'
  const result = await db.execute(query, [userId])
  return result[0]
}

// ❌ NEVER do this - vulnerable to SQL injection
// const query = `SELECT * FROM users WHERE id = ${userId}`;
```

### **Authentication & Authorization**

**Secure Authentication Implementation**

```javascript
// Password hashing with bcrypt
const bcrypt = require('bcrypt')

async function hashPassword(password) {
  const saltRounds = 12 // Use minimum 12 rounds
  return await bcrypt.hash(password, saltRounds)
}

async function verifyPassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword)
}

// Secure session management
function createSecureSession(user) {
  const session = {
    userId: user.id,
    role: user.role,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
  }

  // Store session securely (Redis, encrypted cookies, etc.)
  return jwt.sign(session, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30m',
  })
}
```

**Authorization Controls**

```javascript
// Role-based access control middleware
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (!user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    next()
  }
}

// Usage
app.get(
  '/admin/users',
  authenticateToken,
  requirePermission('admin:users:read'),
  getUsersController,
)
```

### **Data Protection Standards**

**Encryption and Sensitive Data Handling**

```javascript
const crypto = require('crypto')

class DataProtection {
  constructor() {
    this.algorithm = 'aes-256-gcm'
    this.keyLength = 32
  }

  // Encrypt sensitive data
  encrypt(data) {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', this.keyLength)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher(this.algorithm, key, iv)

    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', this.keyLength)
    const decipher = crypto.createDecipher(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex'),
    )

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  // Secure data masking for logs
  maskSensitiveData(data) {
    const sensitiveFields = ['password', 'ssn', 'creditCard', 'email']
    const masked = { ...data }

    sensitiveFields.forEach(field => {
      if (masked[field]) {
        masked[field] = '***MASKED***'
      }
    })

    return masked
  }
}
```

## 🛡️ **SECURITY TESTING INTEGRATION**

### **Automated Security Testing**

**Security Test Automation**

```javascript
// Security unit tests
describe('Security Tests', () => {
  test('should prevent SQL injection', async () => {
    const maliciousInput = "'; DROP TABLE users; --"

    await expect(async () => {
      await getUserById(maliciousInput)
    }).not.toThrow()

    // Verify database integrity
    const userCount = await db.query('SELECT COUNT(*) FROM users')
    expect(userCount).toBeGreaterThan(0)
  })

  test('should require authentication for protected routes', async () => {
    const response = await request(app).get('/api/admin/users').expect(401)

    expect(response.body.error).toBe('Authentication required')
  })

  test('should validate input length limits', async () => {
    const longInput = 'a'.repeat(1001) // Exceeds 1000 char limit

    await expect(async () => {
      await processUserInput(longInput)
    }).rejects.toThrow('Input too long')
  })
})
```

**SAST Integration in Development**

```bash
#!/bin/bash
# .github/workflows/security-tests.yml

name: Security Testing

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Run security linting
      run: |
        npx eslint . --ext .js,.ts --config .eslintrc-security.js
        npx semgrep --config=auto src/

    - name: Run security unit tests
      run: npm run test:security

    - name: SAST scan with CodeQL
      uses: github/codeql-action/analyze@v2
      with:
        languages: javascript

    - name: Dependency vulnerability scan
      run: |
        npm audit --audit-level=high
        npx snyk test --severity-threshold=high
```

### **Security Code Review Process**

**Security Review Checklist**

```markdown
## Security Code Review Checklist

### Input Validation

- [ ] All user inputs are validated and sanitized
- [ ] Input length limits are enforced
- [ ] Special characters are properly handled
- [ ] File upload restrictions are in place

### Authentication & Authorization

- [ ] Authentication is required for protected resources
- [ ] Authorization checks are implemented correctly
- [ ] Session management is secure
- [ ] Password policies are enforced

### Data Protection

- [ ] Sensitive data is encrypted at rest and in transit
- [ ] PII is properly handled and masked in logs
- [ ] Database queries use parameterized statements
- [ ] Error messages don't leak sensitive information

### Security Headers & Configuration

- [ ] Security headers are properly configured
- [ ] HTTPS is enforced
- [ ] CORS policies are restrictive
- [ ] Rate limiting is implemented

### Logging & Monitoring

- [ ] Security events are logged
- [ ] Sensitive data is not logged
- [ ] Log tampering protection is in place
- [ ] Monitoring alerts are configured
```

## 🚨 **INCIDENT RESPONSE INTEGRATION**

### **Security Incident Handling**

**Developer Incident Response**

```bash
#!/bin/bash
# security-incident-response.sh

INCIDENT_TYPE=$1
SEVERITY=$2

echo "🚨 Security incident detected: $INCIDENT_TYPE (Severity: $SEVERITY)"

case $SEVERITY in
    "critical")
        # Immediate actions for critical security incidents
        echo "🔒 Initiating emergency security protocols..."

        # Disable affected services
        kubectl patch deployment $AFFECTED_SERVICE -p '{"spec":{"replicas":0}}'

        # Create security incident branch
        git checkout -b "security-incident/$(date +%Y%m%d-%H%M%S)"

        # Notify security team immediately
        curl -X POST $SECURITY_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d "{\"incident\": \"$INCIDENT_TYPE\", \"severity\": \"$SEVERITY\"}"
        ;;
    "high")
        # High priority incident response
        echo "⚠️  High priority security incident response..."

        # Create incident tracking issue
        gh issue create \
            --title "🚨 Security Incident: $INCIDENT_TYPE" \
            --body "High priority security incident requiring immediate attention" \
            --label "security,incident,high-priority"
        ;;
esac

# Log incident details
echo "$(date): Security incident $INCIDENT_TYPE reported (Severity: $SEVERITY)" >> security-incidents.log
```

### **Security Training Integration**

**Developer Security Education**

- **Secure Coding Training**: Regular training on secure coding practices
- **Threat Awareness**: Updates on current threat landscape and attack vectors
- **Tool Training**: Education on security tools and their proper usage
- **Incident Simulation**: Regular security incident response drills

**Security Champions Program**

- **Peer Security Advocates**: Developers trained as security champions
- **Code Review Leadership**: Security-focused code review guidance
- **Knowledge Sharing**: Regular security knowledge sharing sessions
- **Security Tool Evangelism**: Promotion of security tools and practices

---

_Secure development practices must be embedded throughout the development lifecycle, with comprehensive training, automated testing, and clear incident response procedures to maintain robust security posture._
