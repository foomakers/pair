# API Security Implementation

## 🎯 **PURPOSE**

Comprehensive security framework for REST APIs, GraphQL endpoints, and microservices to protect against common vulnerabilities, implement proper authentication/authorization, and ensure secure data transmission.

## 🔐 **API AUTHENTICATION & AUTHORIZATION**

### **Multi-Layer Authentication Strategy**

#### JWT Token-Based Authentication

```javascript
// Secure JWT implementation
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

class JWTManager {
  constructor() {
    this.accessTokenExpiry = '15m'
    this.refreshTokenExpiry = '7d'
    this.algorithm = 'RS256' // Use asymmetric encryption
  }

  generateTokenPair(user) {
    const payload = {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
    }

    const accessToken = jwt.sign(payload, process.env.JWT_PRIVATE_KEY, {
      algorithm: this.algorithm,
      expiresIn: this.accessTokenExpiry,
      issuer: 'api.company.com',
      audience: 'web-app',
    })

    const refreshToken = this.generateRefreshToken(user.id)

    return { accessToken, refreshToken }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
        algorithms: [this.algorithm],
        issuer: 'api.company.com',
        audience: 'web-app',
      })
    } catch (error) {
      throw new AuthenticationError('Invalid token')
    }
  }
}
```

#### Role-Based Access Control (RBAC)

```javascript
// RBAC middleware implementation
const rbac = {
  roles: {
    admin: ['create', 'read', 'update', 'delete', 'manage'],
    editor: ['create', 'read', 'update'],
    viewer: ['read'],
  },

  hasPermission(userRole, requiredPermission) {
    const permissions = this.roles[userRole] || []
    return permissions.includes(requiredPermission)
  },
}

function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
    }

    if (!rbac.hasPermission(user.role, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: permission,
        current: user.role,
      })
    }

    next()
  }
}
```

### **API Rate Limiting & Throttling**

#### Intelligent Rate Limiting

```javascript
const redis = require('redis')
const client = redis.createClient()

class RateLimiter {
  constructor() {
    this.limits = {
      admin: { requests: 1000, window: 3600 },
      user: { requests: 100, window: 3600 },
      anonymous: { requests: 10, window: 3600 },
    }
  }

  async checkLimit(identifier, userType = 'anonymous') {
    const key = `rate_limit:${userType}:${identifier}`
    const limit = this.limits[userType]

    const current = await client.incr(key)

    if (current === 1) {
      await client.expire(key, limit.window)
    }

    const remaining = Math.max(0, limit.requests - current)
    const resetTime = await client.ttl(key)

    return {
      allowed: current <= limit.requests,
      remaining,
      resetTime: Date.now() + resetTime * 1000,
    }
  }
}

// Rate limiting middleware
async function rateLimitMiddleware(req, res, next) {
  const identifier = req.ip
  const userType = req.user ? req.user.role : 'anonymous'

  const limiter = new RateLimiter()
  const result = await limiter.checkLimit(identifier, userType)

  res.set({
    'X-RateLimit-Limit': limiter.limits[userType].requests,
    'X-RateLimit-Remaining': result.remaining,
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  })

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.resetTime,
    })
  }

  next()
}
```

## 🛡️ **INPUT VALIDATION & SANITIZATION**

### **Comprehensive Input Validation**

#### Schema-Based Validation

```javascript
const Joi = require('joi')

// Define validation schemas
const schemas = {
  createUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required(),
    name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s]+$/)
      .required(),
    role: Joi.string().valid('user', 'admin', 'editor').default('user'),
  }),

  updateProfile: Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s]+$/),
    bio: Joi.string().max(500),
    website: Joi.string().uri(),
  }).min(1),
}

// Validation middleware
function validateInput(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName]

    if (!schema) {
      return res.status(500).json({ error: 'Validation schema not found' })
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    })

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        code: detail.type,
      }))

      return res.status(400).json({
        error: 'Validation failed',
        details,
      })
    }

    req.validatedData = value
    next()
  }
}
```

#### SQL Injection Prevention

```javascript
// Always use parameterized queries
class DatabaseSecurity {
  static async getUserById(userId) {
    // ✅ Secure - parameterized query
    const query = 'SELECT id, email, name FROM users WHERE id = ? AND deleted_at IS NULL'
    return await db.execute(query, [userId])
  }

  static async searchUsers(searchTerm) {
    // ✅ Secure - parameterized with LIKE
    const query = `
            SELECT id, email, name 
            FROM users 
            WHERE (name LIKE ? OR email LIKE ?) 
            AND deleted_at IS NULL 
            LIMIT 50
        `
    const likePattern = `%${searchTerm}%`
    return await db.execute(query, [likePattern, likePattern])
  }

  // ❌ NEVER use string concatenation for queries
  // const query = `SELECT * FROM users WHERE name = '${userName}'`; // VULNERABLE!
}
```

## 🔒 **SECURE COMMUNICATIONS**

### **HTTPS and TLS Configuration**

#### Express.js Security Headers

```javascript
const helmet = require('helmet')
const express = require('express')

const app = express()

// Security headers configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imageSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
)

// CORS configuration
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
  const origin = req.headers.origin

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }

  next()
})
```

### **API Logging & Monitoring**

#### Security Event Logging

```javascript
const winston = require('winston')

// Security-focused logging configuration
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'api-security' },
  transports: [
    new winston.transports.File({ filename: 'security-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'security-audit.log' }),
  ],
})

// Security event logging middleware
function securityLogger(req, res, next) {
  const startTime = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: duration,
      userId: req.user?.id || 'anonymous',
      timestamp: new Date().toISOString(),
    }

    // Log security events
    if (res.statusCode === 401) {
      securityLogger.warn('Authentication failure', logData)
    } else if (res.statusCode === 403) {
      securityLogger.warn('Authorization failure', logData)
    } else if (res.statusCode === 429) {
      securityLogger.warn('Rate limit exceeded', logData)
    } else if (res.statusCode >= 400) {
      securityLogger.error('API error', logData)
    }

    // Log all API access for audit
    securityLogger.info('API access', logData)
  })

  next()
}
```

## 🚨 **API SECURITY TESTING**

### **Automated Security Testing**

#### Security Test Suite

```javascript
// API security tests
describe('API Security Tests', () => {
  describe('Authentication', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app).get('/api/protected-resource').expect(401)

      expect(response.body.error).toBe('Authentication required')
    })

    test('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/protected-resource')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)
    })
  })

  describe('Input Validation', () => {
    test('should prevent SQL injection attempts', async () => {
      const maliciousInput = "'; DROP TABLE users; --"

      const response = await request(app)
        .post('/api/users/search')
        .send({ query: maliciousInput })
        .expect(400)

      expect(response.body.error).toContain('Validation failed')
    })

    test('should sanitize XSS attempts', async () => {
      const xssInput = '<script>alert("xss")</script>'

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: xssInput })
        .expect(400)
    })
  })

  describe('Rate Limiting', () => {
    test('should enforce rate limits for anonymous users', async () => {
      const requests = Array(15).fill(null)

      for (let i = 0; i < 10; i++) {
        await request(app).get('/api/public-data').expect(200)
      }

      // 11th request should be rate limited
      await request(app).get('/api/public-data').expect(429)
    })
  })
})
```

### **Security Monitoring & Alerting**

#### Real-time Security Monitoring

```javascript
// Security monitoring service
class SecurityMonitor {
  constructor() {
    this.suspiciousPatterns = [/union.*select/i, /<script.*>/i, /\.\.\//, /eval\(/i]

    this.alertThresholds = {
      failed_auth: 5,
      rate_limit_hits: 10,
      validation_failures: 20,
    }
  }

  detectSuspiciousActivity(req) {
    const suspicious = []

    // Check request body for malicious patterns
    const requestBody = JSON.stringify(req.body)
    this.suspiciousPatterns.forEach(pattern => {
      if (pattern.test(requestBody)) {
        suspicious.push(`Suspicious pattern detected: ${pattern.source}`)
      }
    })

    // Check for rapid requests from same IP
    const recentRequests = this.getRecentRequests(req.ip)
    if (recentRequests > 50) {
      suspicious.push('High request frequency detected')
    }

    if (suspicious.length > 0) {
      this.triggerSecurityAlert(req.ip, suspicious)
    }

    return suspicious
  }

  async triggerSecurityAlert(ip, issues) {
    const alert = {
      timestamp: new Date().toISOString(),
      ip,
      issues,
      severity: issues.length > 2 ? 'high' : 'medium',
    }

    // Send to security team
    await this.sendAlert(alert)

    // Consider blocking IP temporarily
    if (alert.severity === 'high') {
      await this.temporaryIpBlock(ip, 300) // 5 minutes
    }
  }
}
```

---

_Comprehensive API security requires multiple layers of protection including authentication, authorization, input validation, secure communications, and continuous monitoring to defend against evolving threats._
