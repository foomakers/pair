# Security Implementation Patterns

## Strategic Overview

This framework establishes comprehensive security implementation patterns that ensure robust application security through systematic threat prevention, authentication mechanisms, data protection, and security monitoring across all application layers.

## Core Security Architecture

### Authentication and Authorization Framework

#### **JWT Authentication System**
```typescript
// lib/auth/jwt-service.ts
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { promisify } from 'util';
import { Logger } from '@/lib/logger';
import { CacheService } from '@/lib/cache';
import { AuditLogger } from '@/lib/audit';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface RefreshTokenData {
  userId: string;
  tokenFamily: string;
  version: number;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

export class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private logger: Logger,
    private cache: CacheService,
    private auditLogger: AuditLogger,
    private config: {
      accessTokenExpiry: string;
      refreshTokenExpiry: string;
      accessTokenSecret: string;
      refreshTokenSecret: string;
      issuer: string;
      audience: string;
      algorithm: jwt.Algorithm;
    }
  ) {
    this.accessTokenSecret = config.accessTokenSecret;
    this.refreshTokenSecret = config.refreshTokenSecret;
    this.issuer = config.issuer;
    this.audience = config.audience;

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      throw new Error('JWT secrets must be provided');
    }
  }

  public async generateTokenPair(
    user: {
      id: string;
      email: string;
      role: string;
      permissions: string[];
    },
    metadata: {
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const sessionId = crypto.randomUUID();
      const tokenFamily = crypto.randomUUID();

      // Create access token
      const accessTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        sessionId,
        iss: this.issuer,
        aud: this.audience
      };

      const accessToken = jwt.sign(accessTokenPayload, this.accessTokenSecret, {
        expiresIn: this.config.accessTokenExpiry,
        algorithm: this.config.algorithm
      });

      // Create refresh token
      const refreshTokenPayload = {
        userId: user.id,
        sessionId,
        tokenFamily,
        version: 1
      };

      const refreshToken = jwt.sign(refreshTokenPayload, this.refreshTokenSecret, {
        expiresIn: this.config.refreshTokenExpiry,
        algorithm: this.config.algorithm
      });

      // Store refresh token data
      const refreshTokenData: RefreshTokenData = {
        userId: user.id,
        tokenFamily,
        version: 1,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.parseExpiry(this.config.refreshTokenExpiry)),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      };

      await this.cache.set(
        `refresh_token:${tokenFamily}`,
        refreshTokenData,
        this.parseExpiry(this.config.refreshTokenExpiry) / 1000
      );

      // Store active session
      await this.cache.set(
        `session:${sessionId}`,
        {
          userId: user.id,
          tokenFamily,
          createdAt: new Date(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        },
        this.parseExpiry(this.config.accessTokenExpiry) / 1000
      );

      // Log successful token generation
      await this.auditLogger.log({
        action: 'token_generated',
        userId: user.id,
        metadata: {
          sessionId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiry(this.config.accessTokenExpiry) / 1000
      };
    } catch (error) {
      this.logger.error('Failed to generate token pair', error);
      throw new Error('Token generation failed');
    }
  }

  public async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret, {
        algorithms: [this.config.algorithm],
        issuer: this.issuer,
        audience: this.audience
      }) as TokenPayload;

      // Check if session is still active
      const session = await this.cache.get(`session:${payload.sessionId}`);
      if (!session) {
        throw new Error('Session expired or invalid');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      throw error;
    }
  }

  public async refreshTokens(
    refreshToken: string,
    metadata: {
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, this.refreshTokenSecret, {
        algorithms: [this.config.algorithm]
      }) as any;

      // Get stored refresh token data
      const storedTokenData = await this.cache.get(`refresh_token:${payload.tokenFamily}`);
      if (!storedTokenData || storedTokenData.version !== payload.version) {
        // Potential token reuse attack - invalidate all tokens for this family
        await this.invalidateTokenFamily(payload.tokenFamily);
        throw new Error('Invalid refresh token - potential security breach');
      }

      // Check if refresh token has expired
      if (new Date() > storedTokenData.expiresAt) {
        await this.cache.delete(`refresh_token:${payload.tokenFamily}`);
        throw new Error('Refresh token expired');
      }

      // Get user data (you'll need to implement this based on your user service)
      const user = await this.getUserById(payload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new token pair
      const newTokens = await this.generateTokenPair(user, metadata);

      // Invalidate old refresh token
      await this.cache.delete(`refresh_token:${payload.tokenFamily}`);

      // Log successful token refresh
      await this.auditLogger.log({
        action: 'token_refreshed',
        userId: payload.userId,
        metadata: {
          oldTokenFamily: payload.tokenFamily,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      });

      return newTokens;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  public async revokeSession(sessionId: string): Promise<void> {
    try {
      const session = await this.cache.get(`session:${sessionId}`);
      if (session) {
        // Remove session
        await this.cache.delete(`session:${sessionId}`);
        
        // Remove associated refresh token
        await this.cache.delete(`refresh_token:${session.tokenFamily}`);

        // Log session revocation
        await this.auditLogger.log({
          action: 'session_revoked',
          userId: session.userId,
          metadata: { sessionId }
        });
      }
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
      throw error;
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      // This would require a pattern match in your cache implementation
      // For Redis: SCAN for "session:*" and filter by userId
      const userSessions = await this.cache.getKeysByPattern(`session:*`);
      
      for (const sessionKey of userSessions) {
        const session = await this.cache.get(sessionKey);
        if (session && session.userId === userId) {
          const sessionId = sessionKey.replace('session:', '');
          await this.revokeSession(sessionId);
        }
      }

      // Log mass session revocation
      await this.auditLogger.log({
        action: 'all_sessions_revoked',
        userId,
        metadata: { reason: 'security_action' }
      });
    } catch (error) {
      this.logger.error('Failed to revoke all user sessions', error);
      throw error;
    }
  }

  private async invalidateTokenFamily(tokenFamily: string): Promise<void> {
    try {
      await this.cache.delete(`refresh_token:${tokenFamily}`);
      
      // Log security incident
      await this.auditLogger.log({
        action: 'token_family_invalidated',
        metadata: { 
          tokenFamily,
          reason: 'potential_token_reuse_attack'
        }
      });
    } catch (error) {
      this.logger.error('Failed to invalidate token family', error);
    }
  }

  private parseExpiry(expiry: string): number {
    // Parse expressions like "15m", "1h", "7d"
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiry format');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit as keyof typeof multipliers];
  }

  private async getUserById(userId: string): Promise<any> {
    // Implement this based on your user service
    // This should return user data with permissions
    throw new Error('getUserById not implemented');
  }
}
```

#### **Role-Based Access Control (RBAC)**
```typescript
// lib/auth/rbac-service.ts
export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  inherits?: string[]; // Role inheritance
}

export interface User {
  id: string;
  email: string;
  roles: string[];
  customPermissions?: Permission[];
}

export class RBACService {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, string[]> = new Map();

  constructor(
    private logger: Logger,
    private auditLogger: AuditLogger
  ) {}

  public defineRole(role: Role): void {
    this.roles.set(role.id, role);
    this.logger.info(`Role defined: ${role.name}`, { roleId: role.id });
  }

  public assignRoleToUser(userId: string, roleId: string): void {
    if (!this.roles.has(roleId)) {
      throw new Error(`Role ${roleId} does not exist`);
    }

    const userRoles = this.userRoles.get(userId) || [];
    if (!userRoles.includes(roleId)) {
      userRoles.push(roleId);
      this.userRoles.set(userId, userRoles);

      this.auditLogger.log({
        action: 'role_assigned',
        userId,
        metadata: { roleId }
      });
    }
  }

  public removeRoleFromUser(userId: string, roleId: string): void {
    const userRoles = this.userRoles.get(userId) || [];
    const index = userRoles.indexOf(roleId);
    
    if (index > -1) {
      userRoles.splice(index, 1);
      this.userRoles.set(userId, userRoles);

      this.auditLogger.log({
        action: 'role_removed',
        userId,
        metadata: { roleId }
      });
    }
  }

  public async checkPermission(
    userId: string,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    try {
      const userRoles = this.userRoles.get(userId) || [];
      const userPermissions = this.getUserPermissions(userRoles);

      // Check if user has the specific permission
      for (const permission of userPermissions) {
        if (this.matchesPermission(permission, resource, action, context)) {
          await this.auditLogger.log({
            action: 'permission_granted',
            userId,
            metadata: { 
              resource, 
              action, 
              permissionId: permission.id 
            }
          });
          return true;
        }
      }

      await this.auditLogger.log({
        action: 'permission_denied',
        userId,
        metadata: { resource, action }
      });

      return false;
    } catch (error) {
      this.logger.error('Permission check failed', error);
      return false;
    }
  }

  private getUserPermissions(roleIds: string[]): Permission[] {
    const permissions: Permission[] = [];
    const processedRoles = new Set<string>();

    const processRole = (roleId: string) => {
      if (processedRoles.has(roleId)) return;
      processedRoles.add(roleId);

      const role = this.roles.get(roleId);
      if (!role) return;

      // Add role permissions
      permissions.push(...role.permissions);

      // Process inherited roles
      if (role.inherits) {
        role.inherits.forEach(processRole);
      }
    };

    roleIds.forEach(processRole);
    return permissions;
  }

  private matchesPermission(
    permission: Permission,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): boolean {
    // Basic resource and action matching
    if (permission.resource !== '*' && permission.resource !== resource) {
      return false;
    }

    if (permission.action !== '*' && permission.action !== action) {
      return false;
    }

    // Check conditions if present
    if (permission.conditions && context) {
      return this.evaluateConditions(permission.conditions, context);
    }

    return true;
  }

  private evaluateConditions(
    conditions: Record<string, any>,
    context: Record<string, any>
  ): boolean {
    // Simple condition evaluation - extend as needed
    for (const [key, expectedValue] of Object.entries(conditions)) {
      if (context[key] !== expectedValue) {
        return false;
      }
    }
    return true;
  }
}

// Permission decorator for methods
export function RequirePermission(resource: string, action: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const userId = this.getCurrentUserId(); // Implement based on your context
      const rbacService = this.getRBACService(); // Implement based on your DI

      const hasPermission = await rbacService.checkPermission(userId, resource, action);
      
      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
```

### Data Protection and Encryption

#### **Encryption Service**
```typescript
// lib/security/encryption-service.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Logger } from '@/lib/logger';

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
  algorithm: string;
}

export interface EncryptionKey {
  id: string;
  key: Buffer;
  algorithm: string;
  createdAt: Date;
  isActive: boolean;
}

export class EncryptionService {
  private keys: Map<string, EncryptionKey> = new Map();
  private activeKeyId: string | null = null;

  constructor(
    private logger: Logger,
    private config: {
      defaultAlgorithm: string;
      keyRotationInterval: number;
      saltRounds: number;
    }
  ) {}

  public generateKey(algorithm: string = this.config.defaultAlgorithm): EncryptionKey {
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(32); // 256-bit key

    const encryptionKey: EncryptionKey = {
      id: keyId,
      key,
      algorithm,
      createdAt: new Date(),
      isActive: true
    };

    this.keys.set(keyId, encryptionKey);
    
    if (!this.activeKeyId) {
      this.activeKeyId = keyId;
    }

    this.logger.info('Encryption key generated', { keyId, algorithm });
    return encryptionKey;
  }

  public rotateKey(): EncryptionKey {
    // Deactivate current active key
    if (this.activeKeyId) {
      const currentKey = this.keys.get(this.activeKeyId);
      if (currentKey) {
        currentKey.isActive = false;
      }
    }

    // Generate new active key
    const newKey = this.generateKey();
    this.activeKeyId = newKey.id;

    this.logger.info('Encryption key rotated', { 
      oldKeyId: this.activeKeyId, 
      newKeyId: newKey.id 
    });

    return newKey;
  }

  public encrypt(data: string, keyId?: string): EncryptedData {
    try {
      const encryptionKeyId = keyId || this.activeKeyId;
      if (!encryptionKeyId) {
        throw new Error('No encryption key available');
      }

      const encryptionKey = this.keys.get(encryptionKeyId);
      if (!encryptionKey) {
        throw new Error(`Encryption key ${encryptionKeyId} not found`);
      }

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(encryptionKey.algorithm, encryptionKey.key, { iv });

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag().toString('hex');

      return {
        data: encrypted,
        iv: iv.toString('hex'),
        tag,
        algorithm: encryptionKey.algorithm
      };
    } catch (error) {
      this.logger.error('Encryption failed', error);
      throw new Error('Encryption failed');
    }
  }

  public decrypt(encryptedData: EncryptedData, keyId?: string): string {
    try {
      const encryptionKeyId = keyId || this.activeKeyId;
      if (!encryptionKeyId) {
        throw new Error('No encryption key available');
      }

      const encryptionKey = this.keys.get(encryptionKeyId);
      if (!encryptionKey) {
        throw new Error(`Encryption key ${encryptionKeyId} not found`);
      }

      const decipher = crypto.createDecipher(
        encryptedData.algorithm,
        encryptionKey.key,
        { iv: Buffer.from(encryptedData.iv, 'hex') }
      );

      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  public async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.config.saltRounds);
    } catch (error) {
      this.logger.error('Password hashing failed', error);
      throw new Error('Password hashing failed');
    }
  }

  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Password verification failed', error);
      return false;
    }
  }

  public generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  public generateHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  public verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // PII Encryption for GDPR compliance
  public encryptPII(data: any): any {
    if (typeof data === 'string') {
      return this.encrypt(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.encryptPII(item));
    }

    if (typeof data === 'object' && data !== null) {
      const encrypted: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isPIIField(key)) {
          encrypted[key] = this.encrypt(value as string);
        } else {
          encrypted[key] = this.encryptPII(value);
        }
      }
      return encrypted;
    }

    return data;
  }

  private isPIIField(fieldName: string): boolean {
    const piiFields = [
      'email',
      'phone',
      'ssn',
      'address',
      'firstName',
      'lastName',
      'dateOfBirth'
    ];
    return piiFields.includes(fieldName.toLowerCase());
  }
}
```

### Security Middleware and Validation

#### **Security Headers Middleware**
```typescript
// middleware/security-headers.ts
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

export interface SecurityConfig {
  rateLimiting: {
    windowMs: number;
    max: number;
    message: string;
    standardHeaders: boolean;
    legacyHeaders: boolean;
  };
  slowDown: {
    windowMs: number;
    delayAfter: number;
    delayMs: number;
    maxDelayMs: number;
  };
  helmet: {
    contentSecurityPolicy: {
      directives: Record<string, string[]>;
    };
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
  };
}

export function createSecurityMiddleware(config: SecurityConfig) {
  const middlewares = [];

  // Helmet for security headers
  middlewares.push(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          ...config.helmet.contentSecurityPolicy.directives
        },
      },
      hsts: config.helmet.hsts,
      noSniff: true,
      xssFilter: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true
    })
  );

  // Rate limiting
  middlewares.push(
    rateLimit({
      windowMs: config.rateLimiting.windowMs,
      max: config.rateLimiting.max,
      message: config.rateLimiting.message,
      standardHeaders: config.rateLimiting.standardHeaders,
      legacyHeaders: config.rateLimiting.legacyHeaders,
      handler: (req: Request, res: Response) => {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.round(config.rateLimiting.windowMs / 1000)
        });
      }
    })
  );

  // Slow down repeated requests
  middlewares.push(
    slowDown({
      windowMs: config.slowDown.windowMs,
      delayAfter: config.slowDown.delayAfter,
      delayMs: config.slowDown.delayMs,
      maxDelayMs: config.slowDown.maxDelayMs
    })
  );

  // Custom security headers
  middlewares.push((req: Request, res: Response, next: NextFunction) => {
    // Remove server information
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  });

  return middlewares;
}

// Input validation middleware
export function createValidationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize and validate inputs
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  };
}

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

function sanitizeString(str: string): string {
  // Remove potential XSS vectors
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}
```

This comprehensive security implementation framework provides enterprise-grade security patterns including robust authentication, authorization, data protection, encryption, and security middleware that ensures applications maintain the highest security standards through systematic threat prevention and security monitoring.