# Data Encryption Standards

## 🎯 **PURPOSE**

Comprehensive framework for implementing encryption across all data states - at rest, in transit, and in processing - ensuring sensitive information remains protected against unauthorized access throughout its lifecycle.

## 🔐 **ENCRYPTION STRATEGY FRAMEWORK**

### **Multi-Layer Encryption Approach**

**Encryption Coverage Requirements**

- **Data at Rest**: Database encryption, file system encryption, backup encryption
- **Data in Transit**: TLS/SSL, API encryption, message queue encryption
- **Data in Processing**: Memory encryption, temporary file encryption
- **Key Management**: Centralized key lifecycle management and rotation

### **Encryption Decision Matrix**

| Data Classification | Encryption Requirement | Key Management | Performance Impact |
| ------------------- | ---------------------- | -------------- | ------------------ |
| Public              | Optional               | N/A            | None               |
| Internal            | AES-256                | Managed keys   | Low                |
| Confidential        | AES-256 + field-level  | HSM/Vault      | Medium             |
| Restricted          | AES-256 + multi-layer  | HSM + rotation | High               |

## 🛡️ **DATA AT REST ENCRYPTION**

### **Database Encryption Implementation**

**PostgreSQL Transparent Data Encryption**

```sql
-- Enable database-level encryption
CREATE DATABASE secure_app WITH ENCODING 'UTF8';
ALTER DATABASE secure_app SET shared_preload_libraries = 'pg_tde';

-- Column-level encryption for sensitive fields
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    ssn BYTEA, -- Encrypted field
    credit_card BYTEA, -- Encrypted field
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create encryption functions
CREATE OR REPLACE FUNCTION encrypt_sensitive(data TEXT, key_id TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(data, key_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrypt_sensitive(encrypted_data BYTEA, key_id TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(encrypted_data, key_id);
END;
$$ LANGUAGE plpgsql;
```

**Application-Level Field Encryption**

```javascript
const crypto = require('crypto')

class FieldEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm'
    this.keyLength = 32
    this.ivLength = 16
  }

  // Encrypt sensitive fields before database storage
  encryptField(data, fieldKey) {
    if (!data) return null

    const key = this.deriveKey(fieldKey)
    const iv = crypto.randomBytes(this.ivLength)
    const cipher = crypto.createCipher(this.algorithm, key, iv)

    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    // Combine IV, auth tag, and encrypted data
    return JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted,
    })
  }

  // Decrypt sensitive fields after database retrieval
  decryptField(encryptedData, fieldKey) {
    if (!encryptedData) return null

    try {
      const parsed = JSON.parse(encryptedData)
      const key = this.deriveKey(fieldKey)
      const iv = Buffer.from(parsed.iv, 'hex')
      const authTag = Buffer.from(parsed.authTag, 'hex')

      const decipher = crypto.createDecipher(this.algorithm, key, iv)
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(parsed.data, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      throw new Error('Failed to decrypt field data')
    }
  }

  deriveKey(fieldKey) {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY
    return crypto.scryptSync(fieldKey, masterKey, this.keyLength)
  }
}

// Usage in data models
class UserModel {
  static async create(userData) {
    const encryption = new FieldEncryption()

    const encryptedUser = {
      ...userData,
      ssn: userData.ssn ? encryption.encryptField(userData.ssn, 'user_ssn') : null,
      creditCard: userData.creditCard
        ? encryption.encryptField(userData.creditCard, 'user_cc')
        : null,
    }

    return await db.users.create(encryptedUser)
  }

  static async findDecrypted(userId) {
    const user = await db.users.findById(userId)
    if (!user) return null

    const encryption = new FieldEncryption()

    return {
      ...user,
      ssn: user.ssn ? encryption.decryptField(user.ssn, 'user_ssn') : null,
      creditCard: user.creditCard ? encryption.decryptField(user.creditCard, 'user_cc') : null,
    }
  }
}
```

### **File System Encryption**

**Document Storage Encryption**

```javascript
const fs = require('fs').promises
const crypto = require('crypto')

class FileEncryption {
  constructor() {
    this.algorithm = 'aes-256-cbc'
    this.keyLength = 32
    this.ivLength = 16
  }

  async encryptFile(filePath, outputPath) {
    const key = crypto.randomBytes(this.keyLength)
    const iv = crypto.randomBytes(this.ivLength)

    const cipher = crypto.createCipher(this.algorithm, key, iv)

    const input = await fs.readFile(filePath)
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()])

    // Store key and IV securely (e.g., in key management service)
    const keyData = {
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      algorithm: this.algorithm,
    }

    await this.storeKey(outputPath, keyData)
    await fs.writeFile(outputPath, encrypted)

    return {
      encryptedPath: outputPath,
      keyReference: `${outputPath}.key`,
    }
  }

  async decryptFile(encryptedPath) {
    const keyData = await this.retrieveKey(encryptedPath)
    const key = Buffer.from(keyData.key, 'hex')
    const iv = Buffer.from(keyData.iv, 'hex')

    const decipher = crypto.createDecipher(keyData.algorithm, key, iv)
    const encrypted = await fs.readFile(encryptedPath)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

    return decrypted
  }

  async storeKey(filePath, keyData) {
    // Store in secure key management service
    const keyVault = new KeyVaultClient()
    await keyVault.setSecret(`file-key-${filePath}`, JSON.stringify(keyData))
  }

  async retrieveKey(filePath) {
    const keyVault = new KeyVaultClient()
    const keyDataStr = await keyVault.getSecret(`file-key-${filePath}`)
    return JSON.parse(keyDataStr)
  }
}
```

## 🌐 **DATA IN TRANSIT ENCRYPTION**

### **TLS/SSL Configuration**

**Express.js HTTPS Setup**

```javascript
const https = require('https')
const fs = require('fs')
const express = require('express')

const app = express()

// TLS configuration
const tlsOptions = {
  cert: fs.readFileSync('/path/to/cert.pem'),
  key: fs.readFileSync('/path/to/private-key.pem'),

  // Security configurations
  secureProtocol: 'TLSv1_2_method',
  ciphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384',
  ].join(':'),
  honorCipherOrder: true,

  // Perfect Forward Secrecy
  dhparam: fs.readFileSync('/path/to/dhparam.pem'),
}

// Enforce HTTPS redirect
app.use((req, res, next) => {
  if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`)
  }
  next()
})

// Security headers for encryption
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

const server = https.createServer(tlsOptions, app)
server.listen(443, () => {
  console.log('HTTPS Server running on port 443')
})
```

### **API Response Encryption**

**End-to-End API Encryption**

```javascript
class APIEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm'
  }

  // Encrypt API responses for sensitive endpoints
  encryptResponse(data, clientPublicKey) {
    // Generate symmetric key for this response
    const symmetricKey = crypto.randomBytes(32)
    const iv = crypto.randomBytes(16)

    // Encrypt data with symmetric key
    const cipher = crypto.createCipher(this.algorithm, symmetricKey, iv)
    let encryptedData = cipher.update(JSON.stringify(data), 'utf8', 'hex')
    encryptedData += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    // Encrypt symmetric key with client's public key
    const encryptedKey = crypto.publicEncrypt(clientPublicKey, symmetricKey)

    return {
      encryptedData,
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    }
  }

  // Middleware for automatic response encryption
  static responseEncryptionMiddleware(req, res, next) {
    const originalJson = res.json

    res.json = function (data) {
      // Check if client supports encryption
      const clientPublicKey = req.headers['x-client-public-key']
      const encryptionRequired = req.headers['x-require-encryption'] === 'true'

      if (clientPublicKey && encryptionRequired) {
        const encryption = new APIEncryption()
        const encryptedResponse = encryption.encryptResponse(data, clientPublicKey)
        return originalJson.call(this, {
          encrypted: true,
          payload: encryptedResponse,
        })
      }

      return originalJson.call(this, data)
    }

    next()
  }
}
```

## 🔑 **KEY MANAGEMENT SYSTEM**

### **Centralized Key Management**

**Key Vault Integration**

```javascript
const { KeyVaultSecret } = require('@azure/keyvault-secrets')

class KeyManagementService {
  constructor() {
    this.keyVault = new KeyVaultSecret(process.env.KEY_VAULT_URL, new DefaultAzureCredential())
  }

  // Generate and store new encryption keys
  async generateKey(keyName, keyType = 'aes-256') {
    const key = crypto.randomBytes(32)
    const keyMetadata = {
      type: keyType,
      createdAt: new Date().toISOString(),
      version: 1,
    }

    await this.keyVault.setSecret(keyName, key.toString('hex'), {
      tags: keyMetadata,
    })

    return keyName
  }

  // Retrieve encryption keys
  async getKey(keyName) {
    try {
      const secret = await this.keyVault.getSecret(keyName)
      return Buffer.from(secret.value, 'hex')
    } catch (error) {
      throw new Error(`Failed to retrieve key: ${keyName}`)
    }
  }

  // Key rotation implementation
  async rotateKey(keyName) {
    const currentKey = await this.getKey(keyName)
    const newKey = crypto.randomBytes(32)

    // Store new key version
    const newVersion = `${keyName}-v${Date.now()}`
    await this.keyVault.setSecret(newVersion, newKey.toString('hex'))

    // Update current key reference
    await this.keyVault.setSecret(`${keyName}-current`, newVersion)

    // Schedule old key for deletion (after grace period)
    setTimeout(async () => {
      await this.keyVault.beginDeleteSecret(keyName)
    }, 30 * 24 * 60 * 60 * 1000) // 30 days

    return newVersion
  }

  // Automated key rotation scheduler
  scheduleKeyRotation(keyName, intervalDays = 90) {
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000

    setInterval(async () => {
      try {
        await this.rotateKey(keyName)
        console.log(`Key rotated successfully: ${keyName}`)
      } catch (error) {
        console.error(`Key rotation failed for ${keyName}:`, error)
        // Alert security team
        this.alertSecurityTeam('key-rotation-failure', { keyName, error: error.message })
      }
    }, intervalMs)
  }
}
```

### **Key Rotation Strategy**

**Automated Key Rotation Process**

```bash
#!/bin/bash
# key-rotation-script.sh

KEY_VAULT_URL="https://your-keyvault.vault.azure.net/"
NOTIFICATION_WEBHOOK="https://your-webhook-url"

rotate_encryption_keys() {
    echo "🔄 Starting encryption key rotation..."

    # Get list of keys that need rotation
    KEYS_TO_ROTATE=$(az keyvault secret list --vault-name $KEY_VAULT_NAME \
        --query "[?attributes.created < '$(date -d '90 days ago' -u +%Y-%m-%dT%H:%M:%SZ)'].name" \
        --output tsv)

    for key in $KEYS_TO_ROTATE; do
        echo "🔑 Rotating key: $key"

        # Generate new key version
        NEW_KEY=$(openssl rand -hex 32)

        # Store new key version
        az keyvault secret set \
            --vault-name $KEY_VAULT_NAME \
            --name "$key-v$(date +%s)" \
            --value $NEW_KEY

        # Update application configuration
        kubectl patch configmap encryption-keys \
            --type merge \
            -p "{\"data\":{\"$key\":\"$key-v$(date +%s)\"}}"

        # Verify new key works
        if ! test_key_functionality "$key-v$(date +%s)"; then
            echo "❌ Key rotation failed for $key"
            send_alert "Key rotation failure" "$key rotation failed validation"
            continue
        fi

        echo "✅ Key $key rotated successfully"
    done
}

test_key_functionality() {
    local key_name=$1

    # Test encryption/decryption with new key
    TEST_DATA="encryption-test-$(date +%s)"
    ENCRYPTED=$(echo $TEST_DATA | openssl enc -aes-256-cbc -base64 -K $NEW_KEY -iv $(openssl rand -hex 16))
    DECRYPTED=$(echo $ENCRYPTED | openssl enc -aes-256-cbc -d -base64 -K $NEW_KEY -iv $(openssl rand -hex 16))

    [ "$TEST_DATA" = "$DECRYPTED" ]
}

send_alert() {
    curl -X POST $NOTIFICATION_WEBHOOK \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$1\", \"details\": \"$2\"}"
}

# Run key rotation
rotate_encryption_keys
```

---

_Comprehensive data encryption requires careful implementation across all data states, robust key management, and regular rotation procedures to maintain security effectiveness over time._
