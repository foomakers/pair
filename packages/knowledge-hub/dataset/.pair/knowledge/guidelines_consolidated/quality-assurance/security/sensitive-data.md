# Sensitive Data Protection

## 🎯 **PURPOSE**

Comprehensive framework for identifying, classifying, handling, and protecting sensitive data throughout its lifecycle, ensuring compliance with privacy regulations and minimizing data exposure risks.

## 🏷️ **DATA CLASSIFICATION FRAMEWORK**

### **Sensitivity Classification Levels**

**Data Classification Hierarchy**

- **Public**: Information available to general public
- **Internal**: Information for organizational use only
- **Confidential**: Sensitive business information requiring protection
- **Restricted**: Highly sensitive data with strict access controls

### **Data Type Classification Matrix**

| Data Type        | Classification | Retention              | Encryption             | Access Control   |
| ---------------- | -------------- | ---------------------- | ---------------------- | ---------------- |
| User credentials | Restricted     | 90 days after deletion | AES-256 + field-level  | Admin only       |
| Payment info     | Restricted     | Per PCI DSS            | AES-256 + tokenization | Authorized staff |
| Personal data    | Confidential   | Per GDPR/CCPA          | AES-256                | Role-based       |
| Business data    | Internal       | 7 years                | AES-256                | Department-based |
| Public content   | Public         | Indefinite             | Optional               | Public access    |

## 🔍 **DATA DISCOVERY AND INVENTORY**

### **Automated Data Discovery**

**Sensitive Data Scanner**

Automated sensitive data discovery includes comprehensive pattern-based scanning for personally identifiable information, financial data, authentication credentials, and business-sensitive information across file systems, databases, and application repositories.

Pattern recognition implementation includes Social Security Number detection using format validation, credit card number identification with Luhn algorithm verification, email address discovery through comprehensive regex patterns, phone number detection with format validation, IP address identification for network security analysis, and API key discovery for credential security assessment.

Sensitivity scoring methodology includes maximum risk classification for Social Security Numbers and payment card information, high sensitivity assignment for API keys and authentication credentials, medium sensitivity for personal contact information, and low sensitivity for network identifiers and public information elements.

File scanning process includes content analysis for sensitive data patterns, finding categorization by data type and sensitivity level, sample collection for validation purposes, location mapping for remediation guidance, and comprehensive reporting with risk assessment and actionable recommendations.

Directory scanning capabilities include recursive file system analysis, binary file exclusion for performance optimization, large file skipping to maintain scan efficiency, selective scanning based on file type and extension, and comprehensive result aggregation with summary statistics and detailed findings.

Sensitivity calculation includes maximum sensitivity detection from identified patterns, finding count impact assessment, overall risk scoring with weighted calculations, and risk categorization into high, medium, and low risk classifications for prioritized remediation efforts.

Report generation includes summary statistics with file count and risk distribution, detailed findings with location and context information, data type categorization for comprehensive coverage analysis, and actionable recommendations for immediate security improvements and long-term data protection strategy implementation.

### **Database Data Classification**

**SQL Data Classification Scanner**

```sql
-- Data classification metadata table
Database data classification includes comprehensive metadata schema creation with data sensitivity tagging, column-level classification implementation, automated classification rule application, and systematic data inventory maintenance for regulatory compliance and access control enforcement.

Classification metadata management includes data sensitivity level assignment using standardized taxonomy, data owner identification for accountability, access control requirement specification, retention policy association, and comprehensive audit trail maintenance for classification decisions and modifications.

Data classification automation includes pattern-based classification using content analysis, metadata inheritance from parent schemas, classification rule engine implementation, and automated compliance validation to ensure consistent data protection across database systems and applications.

**Data Masking and Anonymization**

Data masking implementation includes role-based data access control with dynamic masking capabilities, field-level sensitivity assessment, context-aware masking rule application, and comprehensive user authorization validation to ensure appropriate data protection based on user privileges and access requirements.

Masking rule configuration includes field name pattern matching for automated rule application, classification-based masking determination, role-specific access matrix implementation, and fallback masking strategies for comprehensive data protection coverage across all data access scenarios.

Access control matrix includes administrative full access privileges, managerial restricted data access limitations, employee confidential data masking requirements, contractor additional access restrictions, and guest user comprehensive data masking to ensure appropriate data protection based on user role and business requirements.

Masking methodology includes complete redaction for highly sensitive data, partial masking for confidential information with visible character preservation, pattern-based masking for specific data types, and length-preserving masking to maintain data format integrity for application compatibility.

Dynamic masking capabilities include real-time data transformation during query execution, context-aware masking based on user credentials, application-transparent implementation, and performance-optimized masking algorithms to ensure minimal impact on system performance and user experience.

### **Data Loss Prevention (DLP)**

**DLP Monitoring System**-- Function to classify table columns
CREATE OR REPLACE FUNCTION classify_table_columns(target_schema VARCHAR)
RETURNS TABLE(
    table_name VARCHAR,
    column_name VARCHAR,
    data_type VARCHAR,
    suggested_classification VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.table_name::VARCHAR,
        c.column_name::VARCHAR,
        c.data_type::VARCHAR,
        CASE
            WHEN c.column_name ILIKE '%password%' OR c.column_name ILIKE '%pwd%'
                THEN 'RESTRICTED'
            WHEN c.column_name ILIKE '%ssn%' OR c.column_name ILIKE '%social%'
                THEN 'RESTRICTED'
            WHEN c.column_name ILIKE '%credit%' OR c.column_name ILIKE '%card%'
                THEN 'RESTRICTED'
            WHEN c.column_name ILIKE '%email%' OR c.column_name ILIKE '%phone%'
                THEN 'CONFIDENTIAL'
            WHEN c.column_name ILIKE '%name%' OR c.column_name ILIKE '%address%'
                THEN 'CONFIDENTIAL'
            WHEN c.column_name ILIKE '%id%' AND c.data_type = 'uuid'
                THEN 'INTERNAL'
            ELSE 'PUBLIC'
        END::VARCHAR
    FROM information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name
    WHERE t.table_schema = target_schema
    AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name, c.ordinal_position;
END;
$$ LANGUAGE plpgsql;
```

## 🛡️ **DATA PROTECTION IMPLEMENTATION**

### **Field-Level Data Masking**

**Dynamic Data Masking**

```javascript
class DataMaskingService {
  constructor() {
    this.maskingRules = {
      ssn: value => value.replace(/\d(?=\d{4})/g, '*'),
      creditCard: value => value.replace(/\d(?=\d{4})/g, '*'),
      email: value => {
        const [local, domain] = value.split('@')
        const maskedLocal =
          local.length > 2 ? local.substring(0, 2) + '*'.repeat(local.length - 2) : local
        return `${maskedLocal}@${domain}`
      },
      phone: value => value.replace(/\d(?=\d{4})/g, '*'),
      name: value => {
        const parts = value.split(' ')
        return parts
          .map(part => (part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : part))
          .join(' ')
      },
    }
  }

  maskSensitiveData(data, userRole, dataClassification) {
    if (!data || typeof data !== 'object') return data

    const masked = { ...data }

    for (const [field, value] of Object.entries(masked)) {
      const fieldClassification = dataClassification[field]

      if (this.shouldMaskField(fieldClassification, userRole)) {
        const maskingRule = this.getMaskingRule(field, fieldClassification)
        masked[field] = maskingRule ? maskingRule(value) : this.defaultMask(value)
      }
    }

    return masked
  }

  shouldMaskField(classification, userRole) {
    const accessMatrix = {
      admin: [],
      manager: ['RESTRICTED'],
      employee: ['RESTRICTED', 'CONFIDENTIAL'],
      contractor: ['RESTRICTED', 'CONFIDENTIAL'],
      guest: ['RESTRICTED', 'CONFIDENTIAL', 'INTERNAL'],
    }

    const restrictedFor = accessMatrix[userRole] || accessMatrix['guest']
    return restrictedFor.includes(classification)
  }

  getMaskingRule(fieldName, classification) {
    // Try to match field name patterns
    for (const [pattern, rule] of Object.entries(this.maskingRules)) {
      if (fieldName.toLowerCase().includes(pattern.toLowerCase())) {
        return rule
      }
    }

    // Fallback based on classification
    switch (classification) {
      case 'RESTRICTED':
        return value => '***REDACTED***'
      case 'CONFIDENTIAL':
        return value => this.partialMask(value)
      default:
        return null
    }
  }

  partialMask(value) {
    if (typeof value !== 'string') return value
    if (value.length <= 4) return '*'.repeat(value.length)

    const visible = Math.floor(value.length * 0.3)
    const start = value.substring(0, visible)
    const end = value.substring(value.length - visible)
    const middle = '*'.repeat(value.length - visible * 2)

    return start + middle + end
  }
}
```

### **Data Loss Prevention (DLP)**

**DLP Monitoring System**

```javascript
Data loss prevention implementation includes comprehensive policy-based monitoring with pattern recognition capabilities, real-time data scanning during transmission, automated violation detection with contextual analysis, and immediate response mechanisms to prevent unauthorized data exposure.

DLP policy framework includes credit card protection with transaction blocking capabilities, Social Security Number protection with immediate access termination, email monitoring for data exfiltration detection, and comprehensive pattern matching for various sensitive data types including API keys, personal identifiers, and financial information.

Outbound data scanning includes comprehensive data analysis during transmission attempts, policy violation detection through pattern matching, context-aware monitoring with user and destination tracking, and real-time violation assessment with immediate action triggers for policy enforcement.

Violation handling includes comprehensive violation logging for audit trail maintenance, policy-based action execution including blocking, quarantine, and monitoring responses, severity-based escalation procedures, and immediate security team notification for critical violations requiring immediate attention.

Data transfer controls include immediate blocking for critical policy violations, data quarantine for suspicious transmission attempts, continuous monitoring for medium-risk scenarios, and comprehensive violation tracking with detailed context information including user identity, destination details, and timestamp recording.

Critical violation response includes automatic security team alerting, immediate access revocation for severe policy breaches, comprehensive incident documentation, and escalation procedures for regulatory compliance and risk management requirements.

**Data Encryption and Storage Security**
```

## 📋 **PRIVACY COMPLIANCE**

### **GDPR Compliance Implementation**

**Data Subject Rights Management**

```javascript
class PrivacyComplianceService {
  constructor() {
    this.dataProcessingPurposes = {
      user_authentication: { lawfulBasis: 'contract', retention: 2190 }, // 6 years
      service_delivery: { lawfulBasis: 'contract', retention: 2555 }, // 7 years
      marketing: { lawfulBasis: 'consent', retention: 1095 }, // 3 years
      analytics: { lawfulBasis: 'legitimate_interest', retention: 730 }, // 2 years
    }
  }

  async handleDataSubjectRequest(requestType, dataSubjectId, details) {
    switch (requestType) {
      case 'access':
        return await this.handleAccessRequest(dataSubjectId)
      case 'rectification':
        return await this.handleRectificationRequest(dataSubjectId, details)
      case 'erasure':
        return await this.handleErasureRequest(dataSubjectId)
      case 'portability':
        return await this.handlePortabilityRequest(dataSubjectId)
      case 'restriction':
        return await this.handleRestrictionRequest(dataSubjectId)
      default:
        throw new Error(`Unknown request type: ${requestType}`)
    }
  }

  async handleAccessRequest(dataSubjectId) {
    // Collect all personal data for the subject
    const personalData = await this.collectPersonalData(dataSubjectId)

    // Include processing information
    const processingInfo = await this.getProcessingInformation(dataSubjectId)

    return {
      dataSubject: dataSubjectId,
      personalData,
      processingInfo,
      generatedAt: new Date(),
      retentionPeriods: this.calculateRetentionPeriods(personalData),
    }
  }

  async handleErasureRequest(dataSubjectId) {
    // Check if erasure is legally required
    const erasureAssessment = await this.assessErasureRequest(dataSubjectId)

    if (!erasureAssessment.canErase) {
      return {
        status: 'denied',
        reason: erasureAssessment.reason,
        legalBasis: erasureAssessment.legalBasis,
      }
    }

    // Execute data erasure
    const erasureResults = await this.executeDataErasure(dataSubjectId)

    return {
      status: 'completed',
      erasureResults,
      completedAt: new Date(),
    }
  }

  async collectPersonalData(dataSubjectId) {
    const tables = [
      'users',
      'user_profiles',
      'orders',
      'payments',
      'support_tickets',
      'audit_logs',
      'session_logs',
    ]

    const personalData = {}

    for (const table of tables) {
      const data = await this.extractPersonalDataFromTable(table, dataSubjectId)
      if (data.length > 0) {
        personalData[table] = data
      }
    }

    return personalData
  }

  async executeDataErasure(dataSubjectId) {
    const results = []

    // Pseudonymize instead of delete where legally required
    const pseudonymizationTables = ['audit_logs', 'financial_records']
    for (const table of pseudonymizationTables) {
      const result = await this.pseudonymizeData(table, dataSubjectId)
      results.push({ table, action: 'pseudonymized', records: result.affectedRows })
    }

    // Delete from other tables
    const deletionTables = ['user_preferences', 'session_logs', 'temporary_data']
    for (const table of deletionTables) {
      const result = await this.deleteData(table, dataSubjectId)
      results.push({ table, action: 'deleted', records: result.affectedRows })
    }

    return results
  }
}
```

---

_Effective sensitive data protection requires comprehensive classification, automated discovery, dynamic masking, loss prevention monitoring, and robust privacy compliance capabilities to ensure data security and regulatory adherence._
