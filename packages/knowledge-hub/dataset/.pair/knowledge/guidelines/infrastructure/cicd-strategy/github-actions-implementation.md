# GitHub Actions Implementation

## Scope

Comprehensive implementation guide for GitHub Actions workflows covering build automation, testing, security scanning, deployment, and monitoring for enterprise development teams.

## Content Summary

- **Workflow Architecture**: Modular, reusable workflow design patterns
- **Security Integration**: SAST, DAST, dependency scanning, and secrets management
- **Deployment Strategies**: Multi-environment deployment with approval gates
- **Monitoring**: Workflow metrics, performance optimization, and incident response

---

## Workflow Architecture

### Core Workflow Structure

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  release:
    types: [published]

env:
  NODE_VERSION: '18'
  PYTHON_VERSION: '3.11'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.changes.outputs.frontend }}
      backend: ${{ steps.changes.outputs.backend }}
      docs: ${{ steps.changes.outputs.docs }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: changes
        with:
          filters: |
            frontend:
              - 'apps/frontend/**'
              - 'packages/ui/**'
            backend:
              - 'apps/api/**'
              - 'packages/core/**'
            docs:
              - 'docs/**'
              - '*.md'
```

### Reusable Workflow Templates

```yaml
# .github/workflows/reusable-build.yml
name: Reusable Build Workflow

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '18'
      package-path:
        required: true
        type: string
      build-command:
        required: false
        type: string
        default: 'pnpm build'
    outputs:
      artifact-name:
        description: 'Name of the build artifact'
        value: ${{ jobs.build.outputs.artifact-name }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      artifact-name: ${{ steps.artifact.outputs.name }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'pnpm'
          cache-dependency-path: '${{ inputs.package-path }}/pnpm-lock.yaml'

      - name: Install dependencies
        run: pnpm install --filter ${{ inputs.package-path }}

      - name: Build
        run: cd ${{ inputs.package-path }} && ${{ inputs.build-command }}

      - name: Upload artifacts
        id: artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ inputs.package-path }}-${{ github.sha }}
          path: ${{ inputs.package-path }}/dist/
          retention-days: 30
```

---

## Security Integration

### Security Scanning Workflow

```yaml
# .github/workflows/security.yml
name: Security Scans

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1' # Weekly scan

jobs:
  sast:
    name: Static Analysis Security Testing
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Run CodeQL Analysis
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript, python

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  dependency-scan:
    name: Dependency Vulnerability Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --fail-on=upgradable

      - name: Upload result to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: snyk.sarif

  secrets-scan:
    name: Secrets Detection
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

### Container Security

```yaml
# Container Security Scanning
container-scan:
  name: Container Security Scan
  runs-on: ubuntu-latest
  if: github.event_name != 'pull_request'

  steps:
    - uses: actions/checkout@v4

    - name: Build Docker image
      run: docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .

    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
        format: 'sarif'
        output: 'trivy-results.sarif'

    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v3
      with:
        sarif_file: 'trivy-results.sarif'
```

---

## Testing Strategies

### Comprehensive Testing Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm test:unit --coverage

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run database migrations
        run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [unit-tests]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright
        run: pnpm playwright install --with-deps

      - name: Build application
        run: pnpm build

      - name: Start application
        run: pnpm start &

      - name: Wait for application
        run: pnpm wait-on http://localhost:3000

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Deployment Strategies

### Multi-Environment Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://staging.example.com

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build for staging
        run: pnpm build
        env:
          NODE_ENV: production
          API_URL: https://api-staging.example.com

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_STAGING }}
          working-directory: ./
          alias-domains: staging.example.com

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: github.event_name == 'release'
    needs: [security-checks, performance-tests]
    environment:
      name: production
      url: https://example.com

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build for production
        run: pnpm build
        env:
          NODE_ENV: production
          API_URL: https://api.example.com

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_PRODUCTION }}
          working-directory: ./
          alias-domains: example.com

      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Rollback Strategy

```yaml
# .github/workflows/rollback.yml
name: Rollback Deployment

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to rollback'
        required: true
        type: choice
        options: [staging, production]
      version:
        description: 'Version to rollback to'
        required: true
        type: string

jobs:
  rollback:
    name: Rollback to Previous Version
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}

    steps:
      - name: Checkout specific version
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.version }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build application
        run: pnpm build
        env:
          NODE_ENV: production

      - name: Deploy rollback
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./

      - name: Verify deployment
        run: |
          curl -f https://${{ github.event.inputs.environment }}.example.com/health

      - name: Notify rollback
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          text: 'Rollback completed for ${{ github.event.inputs.environment }} to version ${{ github.event.inputs.version }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Performance Optimization

### Workflow Performance Monitoring

```yaml
# .github/workflows/performance-monitoring.yml
name: Workflow Performance Monitoring

on:
  workflow_run:
    workflows: ['CI/CD Pipeline']
    types: [completed]

jobs:
  performance-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: Collect workflow metrics
        uses: actions/github-script@v7
        with:
          script: |
            const { data: workflow } = await github.rest.actions.getWorkflowRun({
              owner: context.repo.owner,
              repo: context.repo.repo,
              run_id: context.payload.workflow_run.id
            });

            const duration = new Date(workflow.updated_at) - new Date(workflow.created_at);
            const metrics = {
              workflow_name: workflow.name,
              duration_ms: duration,
              status: workflow.status,
              conclusion: workflow.conclusion,
              run_id: workflow.id
            };

            console.log('Workflow Metrics:', JSON.stringify(metrics, null, 2));

            // Send metrics to monitoring system
            await fetch(process.env.METRICS_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(metrics)
            });
        env:
          METRICS_ENDPOINT: ${{ secrets.METRICS_ENDPOINT }}
```

### Cache Optimization

```yaml
# Cache Strategy Implementation
optimize-caches:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js with cache
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'pnpm'
        cache-dependency-path: |
          pnpm-lock.yaml
          apps/*/pnpm-lock.yaml
          packages/*/pnpm-lock.yaml

    - name: Cache build outputs
      uses: actions/cache@v4
      with:
        path: |
          ~/.pnpm-store
          **/dist
          **/.next/cache
        key: ${{ runner.os }}-build-${{ hashFiles('**/pnpm-lock.yaml') }}-${{ hashFiles('**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx') }}
        restore-keys: |
          ${{ runner.os }}-build-${{ hashFiles('**/pnpm-lock.yaml') }}-
          ${{ runner.os }}-build-
```

---

## Monitoring and Observability

### Workflow Monitoring Dashboard

```yaml
# .github/workflows/monitoring.yml
name: Workflow Monitoring

on:
  schedule:
    - cron: '*/15 * * * *' # Every 15 minutes

jobs:
  monitor-workflows:
    runs-on: ubuntu-latest
    steps:
      - name: Check workflow health
        uses: actions/github-script@v7
        with:
          script: |
            const { data: workflows } = await github.rest.actions.listWorkflowRuns({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'ci-cd.yml',
              per_page: 10
            });

            const failureRate = workflows.workflow_runs
              .filter(run => run.conclusion === 'failure').length / workflows.workflow_runs.length;

            if (failureRate > 0.3) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: `High CI/CD Failure Rate: ${(failureRate * 100).toFixed(1)}%`,
                body: `The CI/CD pipeline has a failure rate of ${(failureRate * 100).toFixed(1)}% in the last 10 runs.`,
                labels: ['bug', 'ci/cd', 'high-priority']
              });
            }
```

### Notification Strategy

```yaml
# Notification Configuration
notifications:
  runs-on: ubuntu-latest
  if: always()
  needs: [build, test, deploy]
  steps:
    - name: Slack Notification
      uses: 8398a7/action-slack@v3
      with:
        status: custom
        custom_payload: |
          {
            channel: '#ci-cd',
            username: 'GitHub Actions',
            icon_emoji: ':github:',
            attachments: [{
              color: '${{ needs.deploy.result == "success" && "good" || "danger" }}',
              blocks: [{
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${{ github.workflow }}* - ${{ github.event_name }}\n*Repository:* ${{ github.repository }}\n*Status:* ${{ needs.deploy.result }}\n*Branch:* ${{ github.ref_name }}\n*Commit:* \`${{ github.sha }}\``
                }
              }]
            }]
          }
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Security Best Practices

### Secrets Management

```yaml
# Secure secrets handling
env:
  # Use repository secrets for sensitive data
  API_KEY: ${{ secrets.API_KEY }}
  DATABASE_PASSWORD: ${{ secrets.DATABASE_PASSWORD }}

  # Use environment-specific secrets
  STAGING_URL: ${{ secrets.STAGING_URL }}
  PRODUCTION_URL: ${{ secrets.PRODUCTION_URL }}

steps:
  - name: Mask sensitive outputs
    run: |
      echo "::add-mask::${{ secrets.API_KEY }}"
      echo "API_KEY=${{ secrets.API_KEY }}" >> $GITHUB_ENV

  - name: Use secrets securely
    run: |
      # Never echo secrets directly
      curl -H "Authorization: Bearer ${API_KEY}" https://api.example.com
```

### OIDC Authentication

```yaml
# OpenID Connect for AWS
permissions:
  id-token: write
  contents: read

steps:
  - name: Configure AWS credentials
    uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
      aws-region: us-east-1

  - name: Deploy to AWS
    run: |
      aws s3 sync ./dist s3://${{ secrets.S3_BUCKET }}
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Workflow Failures

```bash
# Debug workflow steps
- name: Debug workflow
  run: |
    echo "Runner OS: ${{ runner.os }}"
    echo "GitHub Context: ${{ toJson(github) }}"
    echo "Environment Variables:"
    env | sort

# Check artifact availability
- name: List artifacts
  run: |
    curl -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
         "https://api.github.com/repos/${{ github.repository }}/actions/artifacts"
```

#### Cache Issues

```bash
# Clear cache when needed
- name: Clear cache
  run: |
    rm -rf ~/.pnpm-store
    rm -rf node_modules
    rm -rf **/node_modules

# Verify cache keys
- name: Debug cache
  run: |
    echo "Cache key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}"
    echo "Node version: $(node --version)"
    echo "PNPM version: $(pnpm --version)"
```

#### Permission Issues

```bash
# Fix file permissions
- name: Fix permissions
  run: |
    chmod +x scripts/*.sh
    chown -R runner:runner .

# Check GitHub token permissions
- name: Check permissions
  run: |
    curl -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
         "https://api.github.com/user" | jq '.permissions'
```

---

This comprehensive GitHub Actions implementation guide provides enterprise-grade CI/CD automation with security, performance, and reliability built-in from the start.
