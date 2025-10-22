# Cloud Storage Services

## Overview

Comprehensive guide for cloud storage solutions, covering object storage, block storage, file systems, and data archival strategies across different cloud providers.

## Storage Service Categories

### Object Storage

- **Amazon S3**: Industry standard, extensive features, global replication
- **Google Cloud Storage**: Integrated analytics, auto-tiering, nearline/coldline
- **Azure Blob Storage**: Hot/cool/archive tiers, lifecycle management
- **Use Cases**: Static websites, backups, data lakes, content distribution

### Block Storage

- **Amazon EBS**: High IOPS, encryption, snapshots, multiple volume types
- **Google Persistent Disk**: SSD/HDD options, regional persistence, snapshots
- **Azure Managed Disks**: Premium SSD, ultra disks, shared disks
- **Use Cases**: Database storage, file systems, high-performance applications

### File Storage

- **Amazon EFS**: POSIX-compliant, elastic scaling, multi-AZ access
- **Google Filestore**: NFS, high performance, enterprise features
- **Azure Files**: SMB/NFS protocols, Active Directory integration
- **Use Cases**: Shared application data, content repositories, legacy applications

## Decision Matrix: Storage Selection

| Storage Type            | Performance | Cost     | Scalability | Use Cases                           |
| ----------------------- | ----------- | -------- | ----------- | ----------------------------------- |
| **Object Storage**      | Medium      | Low      | Unlimited   | Static content, backups, data lakes |
| **Block Storage (SSD)** | High        | High     | Limited     | Databases, high-performance apps    |
| **Block Storage (HDD)** | Medium      | Medium   | Limited     | Big data, throughput-intensive      |
| **File Storage**        | Medium      | Medium   | High        | Shared storage, legacy apps         |
| **Archive Storage**     | Low         | Very Low | Unlimited   | Long-term retention, compliance     |

## Object Storage Implementation

### S3 Configuration and Usage

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({ region: 'us-east-1' })

// Upload file with metadata
export async function uploadFile(bucket: string, key: string, body: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'application',
    },
    TagSet: [
      { Key: 'Environment', Value: process.env.NODE_ENV || 'development' },
      { Key: 'Application', Value: 'my-app' },
    ],
  })

  return await s3Client.send(command)
}

// Generate presigned URL for secure uploads
export async function generateUploadUrl(bucket: string, key: string, expiresIn: number = 3600) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/octet-stream',
  })

  return await getSignedUrl(s3Client, command, { expiresIn })
}

// Stream large files
export async function downloadFileStream(bucket: string, key: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  const response = await s3Client.send(command)
  return response.Body as ReadableStream
}
```

### Lifecycle Management

```json
{
  "Rules": [
    {
      "ID": "OptimizeStorage",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "data/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        },
        {
          "Days": 365,
          "StorageClass": "DEEP_ARCHIVE"
        }
      ]
    },
    {
      "ID": "DeleteIncompleteUploads",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    },
    {
      "ID": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "STANDARD_IA"
        }
      ],
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 365
      }
    }
  ]
}
```

## Block Storage Optimization

### EBS Volume Configuration

```terraform
# High-performance database storage
resource "aws_ebs_volume" "database" {
  availability_zone = "us-east-1a"
  size              = 1000
  type              = "gp3"
  iops              = 3000
  throughput        = 125
  encrypted         = true
  kms_key_id        = aws_kms_key.ebs.arn

  tags = {
    Name        = "database-volume"
    Environment = "production"
    Backup      = "daily"
  }
}

# Attach to EC2 instance
resource "aws_volume_attachment" "database" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.database.id
  instance_id = aws_instance.database.id
}

# Automated snapshots
resource "aws_dlm_lifecycle_policy" "database_backup" {
  description        = "Database backup policy"
  execution_role_arn = aws_iam_role.dlm_lifecycle_role.arn
  state              = "ENABLED"

  policy_details {
    resource_types   = ["VOLUME"]
    target_tags = {
      Backup = "daily"
    }

    schedule {
      name = "2 weeks of daily snapshots"

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["23:45"]
      }

      retain_rule {
        count = 14
      }

      tags_to_add = {
        SnapshotCreator = "DLM"
      }

      copy_tags = false
    }
  }
}
```

### Performance Monitoring

```bash
#!/bin/bash
# EBS performance monitoring script

# Monitor IOPS
aws cloudwatch get-metric-statistics \
  --namespace AWS/EBS \
  --metric-name VolumeReadOps \
  --dimensions Name=VolumeId,Value=vol-1234567890abcdef0 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Monitor throughput
aws cloudwatch get-metric-statistics \
  --namespace AWS/EBS \
  --metric-name VolumeThroughputPercentage \
  --dimensions Name=VolumeId,Value=vol-1234567890abcdef0 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Check for EBS optimization
aws ec2 describe-instance-attribute \
  --instance-id i-1234567890abcdef0 \
  --attribute ebsOptimized
```

## Cost Optimization Strategies

### Storage Class Analysis

```python
import boto3
import json
from datetime import datetime, timedelta

s3 = boto3.client('s3')
cloudwatch = boto3.client('cloudwatch')

def analyze_storage_usage(bucket_name):
    """Analyze S3 storage usage for cost optimization"""

    # Get storage metrics
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=30)

    # Get bucket size metrics
    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/S3',
        MetricName='BucketSizeBytes',
        Dimensions=[
            {'Name': 'BucketName', 'Value': bucket_name},
            {'Name': 'StorageType', 'Value': 'StandardStorage'}
        ],
        StartTime=start_time,
        EndTime=end_time,
        Period=86400,  # Daily
        Statistics=['Average']
    )

    # Calculate potential savings
    total_size_gb = response['Datapoints'][-1]['Average'] / (1024**3) if response['Datapoints'] else 0

    # Estimate cost savings with intelligent tiering
    standard_cost = total_size_gb * 0.023  # $0.023 per GB for Standard
    ia_cost = total_size_gb * 0.0125       # $0.0125 per GB for IA
    glacier_cost = total_size_gb * 0.004   # $0.004 per GB for Glacier

    savings = {
        'current_monthly_cost': standard_cost,
        'with_ia_transition': standard_cost * 0.7 + ia_cost * 0.3,
        'with_glacier_transition': standard_cost * 0.5 + ia_cost * 0.3 + glacier_cost * 0.2
    }

    return savings

# Usage
bucket_analysis = analyze_storage_usage('my-app-data-bucket')
print(json.dumps(bucket_analysis, indent=2))
```

### Intelligent Tiering Configuration

```terraform
resource "aws_s3_bucket_intelligent_tiering_configuration" "entire_bucket" {
  bucket = aws_s3_bucket.main.id
  name   = "EntireBucket"

  configuration {
    id     = "EntireBucketConfig"
    status = "Enabled"

    optional_fields = ["BucketKeyStatus"]
  }
}

resource "aws_s3_bucket_intelligent_tiering_configuration" "documents" {
  bucket = aws_s3_bucket.main.id
  name   = "Documents"

  configuration {
    id     = "DocumentsConfig"
    status = "Enabled"

    filter {
      prefix = "documents/"
    }

    optional_fields = ["BucketKeyStatus"]
  }
}
```

## Data Transfer Optimization

### CloudFront Integration

```typescript
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'

const cloudfront = new CloudFrontClient({ region: 'us-east-1' })

// Invalidate cache after S3 updates
export async function invalidateCloudFrontCache(distributionId: string, paths: string[]) {
  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
      CallerReference: Date.now().toString(),
    },
  })

  return await cloudfront.send(command)
}

// Optimized file upload with CloudFront invalidation
export async function uploadAndInvalidate(
  bucket: string,
  key: string,
  body: Buffer,
  distributionId: string,
) {
  // Upload to S3
  await uploadFile(bucket, key, body, 'application/octet-stream')

  // Invalidate CloudFront cache
  await invalidateCloudFrontCache(distributionId, [`/${key}`])

  return `https://cdn.example.com/${key}`
}
```

### Cross-Region Replication

```json
{
  "Role": "arn:aws:iam::123456789012:role/replication-role",
  "Rules": [
    {
      "ID": "ReplicateEverything",
      "Status": "Enabled",
      "Priority": 1,
      "Filter": {},
      "Destination": {
        "Bucket": "arn:aws:s3:::destination-bucket",
        "StorageClass": "STANDARD_IA",
        "ReplicationTime": {
          "Status": "Enabled",
          "Time": {
            "Minutes": 15
          }
        },
        "Metrics": {
          "Status": "Enabled",
          "EventThreshold": {
            "Minutes": 15
          }
        }
      },
      "DeleteMarkerReplication": {
        "Status": "Enabled"
      }
    }
  ]
}
```

## Security and Compliance

### Encryption Configuration

```terraform
# S3 bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket versioning for data protection
resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration {
    status = "Enabled"
  }
}

# MFA delete protection
resource "aws_s3_bucket_mfa_delete" "main" {
  bucket = aws_s3_bucket.main.id
  mfa_delete = "Enabled"
}
```

### Access Control

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowApplicationAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/application-role"
      },
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::my-app-bucket/data/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyInsecureConnections",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::my-app-bucket", "arn:aws:s3:::my-app-bucket/*"],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

## Backup and Disaster Recovery

### Automated Backup Strategy

```yaml
# AWS Backup plan
Resources:
  BackupPlan:
    Type: AWS::Backup::BackupPlan
    Properties:
      BackupPlan:
        BackupPlanName: ComprehensiveBackupPlan
        BackupPlanRule:
          - RuleName: DailyBackups
            TargetBackupVault: !Ref BackupVault
            ScheduleExpression: cron(0 5 ? * * *)
            StartWindowMinutes: 480
            CompletionWindowMinutes: 10080
            Lifecycle:
              MoveToColdStorageAfterDays: 30
              DeleteAfterDays: 365
            RecoveryPointTags:
              BackupType: Daily

          - RuleName: WeeklyBackups
            TargetBackupVault: !Ref BackupVault
            ScheduleExpression: cron(0 5 ? * SUN *)
            StartWindowMinutes: 480
            CompletionWindowMinutes: 10080
            Lifecycle:
              MoveToColdStorageAfterDays: 7
              DeleteAfterDays: 2555 # 7 years
            RecoveryPointTags:
              BackupType: Weekly

  BackupSelection:
    Type: AWS::Backup::BackupSelection
    Properties:
      BackupPlan: !Ref BackupPlan
      BackupSelection:
        SelectionName: TagBasedBackupSelection
        IamRoleArn: !GetAtt BackupRole.Arn
        Resources:
          - '*'
        Conditions:
          StringEquals:
            'aws:ResourceTag/Backup': 'true'
```

## Implementation Checklist

### Planning Phase

- [ ] Analyze data access patterns and storage requirements
- [ ] Evaluate performance and durability requirements
- [ ] Plan for data lifecycle and archival policies
- [ ] Design backup and disaster recovery strategy
- [ ] Estimate costs for different storage tiers

### Implementation Phase

- [ ] Configure storage services with appropriate settings
- [ ] Implement encryption and security controls
- [ ] Set up lifecycle policies and cost optimization
- [ ] Configure monitoring and alerting
- [ ] Implement backup and replication strategies

### Optimization Phase

- [ ] Monitor storage costs and usage patterns
- [ ] Optimize storage classes and lifecycle policies
- [ ] Review and adjust backup retention policies
- [ ] Implement data compression and deduplication
- [ ] Plan for capacity management and growth
