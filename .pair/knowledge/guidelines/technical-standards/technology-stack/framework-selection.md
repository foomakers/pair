# Framework Selection Guidelines

Comprehensive framework for evaluating, selecting, and adopting frameworks and libraries that align with project requirements, team capabilities, and long-term maintainability goals.

## Purpose

Establish systematic criteria and processes for framework selection that ensure optimal technology choices while balancing performance, maintainability, community support, and project-specific requirements.

## Framework Evaluation Matrix

### Selection Criteria Framework

```typescript
interface FrameworkEvaluationCriteria {
  technical: TechnicalCriteria
  organizational: OrganizationalCriteria
  strategic: StrategicCriteria
  operational: OperationalCriteria
}

interface TechnicalCriteria {
  performance: PerformanceMetrics
  scalability: ScalabilityMetrics
  security: SecurityMetrics
  compatibility: CompatibilityMetrics
  architecture: ArchitectureMetrics
}

interface OrganizationalCriteria {
  teamExpertise: ExpertiseLevel
  learningCurve: LearningCurveMetrics
  developmentVelocity: VelocityMetrics
  resourceRequirements: ResourceMetrics
}

interface StrategicCriteria {
  longTermViability: ViabilityMetrics
  communitySupport: CommunityMetrics
  licensing: LicensingMetrics
  vendor: VendorMetrics
}

class FrameworkEvaluator {
  private criteria: FrameworkEvaluationCriteria
  private weightConfig: WeightConfiguration

  constructor(criteria: FrameworkEvaluationCriteria, weights: WeightConfiguration) {
    this.criteria = criteria
    this.weightConfig = weights
  }

  evaluateFramework(framework: Framework): FrameworkEvaluation {
    const scores = {
      technical: this.evaluateTechnicalCriteria(framework),
      organizational: this.evaluateOrganizationalCriteria(framework),
      strategic: this.evaluateStrategicCriteria(framework),
      operational: this.evaluateOperationalCriteria(framework),
    }

    const weightedScore = this.calculateWeightedScore(scores)
    const risks = this.identifyRisks(framework, scores)
    const recommendations = this.generateRecommendations(framework, scores)

    return {
      framework: framework.name,
      version: framework.version,
      totalScore: weightedScore,
      categoryScores: scores,
      risks,
      recommendations,
      evaluatedBy: process.env.USER_NAME || 'System',
      evaluatedAt: new Date(),
    }
  }

  private evaluateTechnicalCriteria(framework: Framework): TechnicalScore {
    const performance = this.evaluatePerformance(framework)
    const scalability = this.evaluateScalability(framework)
    const security = this.evaluateSecurity(framework)
    const compatibility = this.evaluateCompatibility(framework)
    const architecture = this.evaluateArchitecture(framework)

    return {
      performance,
      scalability,
      security,
      compatibility,
      architecture,
      total: Math.round((performance + scalability + security + compatibility + architecture) / 5),
    }
  }

  private evaluatePerformance(framework: Framework): number {
    let score = 0
    const benchmarks = framework.benchmarks

    // Runtime performance (0-25 points)
    if (benchmarks.runtime) {
      score += Math.min(25, benchmarks.runtime.score)
    }

    // Memory efficiency (0-25 points)
    if (benchmarks.memory) {
      const memoryScore = Math.max(0, 25 - benchmarks.memory.usage / 100)
      score += memoryScore
    }

    // Bundle size (0-25 points) - for frontend frameworks
    if (benchmarks.bundleSize) {
      const sizeScore = Math.max(0, 25 - benchmarks.bundleSize / 50) // 50KB baseline
      score += sizeScore
    }

    // Load time (0-25 points)
    if (benchmarks.loadTime) {
      const loadScore = Math.max(0, 25 - benchmarks.loadTime / 100) // 100ms baseline
      score += loadScore
    }

    return Math.min(score, 100)
  }

  private evaluateScalability(framework: Framework): number {
    let score = 0
    const scalability = framework.scalability

    // Concurrent request handling (0-30 points)
    if (scalability.concurrency >= this.criteria.technical.scalability.targetConcurrency) {
      score += 30
    } else {
      score +=
        (scalability.concurrency / this.criteria.technical.scalability.targetConcurrency) * 30
    }

    // Horizontal scaling support (0-25 points)
    if (scalability.horizontalScaling) score += 25

    // Caching capabilities (0-20 points)
    score += scalability.cachingSupport * 20

    // Database scaling (0-25 points)
    score += scalability.databaseScaling * 25

    return Math.min(score, 100)
  }

  private evaluateSecurity(framework: Framework): number {
    let score = 0
    const security = framework.security

    // Built-in security features (0-30 points)
    score += security.builtInFeatures.length * 6 // Max 5 features

    // Vulnerability history (0-25 points)
    const vulnScore = Math.max(0, 25 - security.knownVulnerabilities.length * 5)
    score += vulnScore

    // Security audit frequency (0-20 points)
    if (security.lastAudit) {
      const daysSinceAudit = Math.floor(
        (Date.now() - security.lastAudit.getTime()) / (1000 * 60 * 60 * 24),
      )
      const auditScore = Math.max(0, 20 - daysSinceAudit / 30) // 30 days baseline
      score += auditScore
    }

    // Community security practices (0-25 points)
    score += security.communitySecurityScore * 25

    return Math.min(score, 100)
  }

  generateComparisonMatrix(frameworks: Framework[]): ComparisonMatrix {
    const evaluations = frameworks.map(fw => this.evaluateFramework(fw))

    return {
      frameworks: evaluations,
      comparison: this.buildComparisonTable(evaluations),
      recommendation: this.selectBestFramework(evaluations),
      generatedAt: new Date(),
    }
  }

  private selectBestFramework(evaluations: FrameworkEvaluation[]): FrameworkRecommendation {
    const sorted = evaluations.sort((a, b) => b.totalScore - a.totalScore)
    const best = sorted[0]

    return {
      recommended: best.framework,
      score: best.totalScore,
      reasons: this.generateRecommendationReasons(best),
      alternatives: sorted.slice(1, 3).map(e => ({
        name: e.framework,
        score: e.totalScore,
        note: this.generateAlternativeNote(e, best),
      })),
      confidence: this.calculateConfidence(sorted),
    }
  }
}
```

## Frontend Framework Selection

### React vs Vue vs Angular Comparison

```typescript
const frontendFrameworkComparison = {
  react: {
    name: 'React',
    version: '18.x',
    type: FrameworkType.LIBRARY,
    maintainer: 'Meta',
    firstRelease: new Date('2013-05-29'),

    strengths: [
      'Large ecosystem and community',
      'Flexible and unopinionated',
      'Strong TypeScript support',
      'Excellent tooling',
      'Component reusability',
      'Virtual DOM performance',
      'Server-side rendering support',
    ],

    weaknesses: [
      'Steep learning curve for beginners',
      'Requires additional libraries for full application',
      'Frequent API changes',
      'JSX learning requirement',
    ],

    useCases: [
      'Complex single-page applications',
      'Large-scale enterprise applications',
      'Applications requiring high flexibility',
      'Projects with experienced teams',
    ],

    benchmarks: {
      runtime: { score: 85 },
      memory: { usage: 45 },
      bundleSize: 42, // KB
      loadTime: 120, // ms
    },

    scalability: {
      concurrency: 10000,
      horizontalScaling: true,
      cachingSupport: 0.8,
      databaseScaling: 0.7,
    },

    ecosystem: {
      packageCount: 150000,
      activeContributors: 1500,
      githubStars: 220000,
      weeklyDownloads: 20000000,
    },
  },

  vue: {
    name: 'Vue.js',
    version: '3.x',
    type: FrameworkType.FRAMEWORK,
    maintainer: 'Vue Team',
    firstRelease: new Date('2014-02-01'),

    strengths: [
      'Gentle learning curve',
      'Excellent documentation',
      'Template syntax familiarity',
      'Good performance out of the box',
      'Progressive adoption capability',
      'Strong tooling (Vue CLI, Vite)',
      'Composition API flexibility',
    ],

    weaknesses: [
      'Smaller ecosystem compared to React',
      'Less corporate backing',
      'Limited job market',
      'TypeScript support still evolving',
    ],

    useCases: [
      'Rapid prototyping',
      'Small to medium applications',
      'Teams new to modern frameworks',
      'Progressive enhancement projects',
    ],

    benchmarks: {
      runtime: { score: 90 },
      memory: { usage: 38 },
      bundleSize: 34, // KB
      loadTime: 95, // ms
    },
  },

  angular: {
    name: 'Angular',
    version: '17.x',
    type: FrameworkType.FRAMEWORK,
    maintainer: 'Google',
    firstRelease: new Date('2016-09-14'),

    strengths: [
      'Full-featured framework',
      'Excellent TypeScript support',
      'Powerful CLI tooling',
      'Enterprise-ready architecture',
      'Strong testing framework',
      'Dependency injection system',
      'Regular release schedule',
    ],

    weaknesses: [
      'Steep learning curve',
      'Heavy framework overhead',
      'Complex for simple applications',
      'Frequent breaking changes',
    ],

    useCases: [
      'Large enterprise applications',
      'Teams familiar with TypeScript',
      'Projects requiring comprehensive framework',
      'Long-term maintenance projects',
    ],

    benchmarks: {
      runtime: { score: 75 },
      memory: { usage: 65 },
      bundleSize: 130, // KB
      loadTime: 180, // ms
    },
  },
}

const frontendFrameworkDecisionTree = {
  questions: [
    {
      id: 'team_experience',
      question: "What is your team's experience level with modern JavaScript frameworks?",
      options: [
        { value: 'beginner', label: 'Beginner (< 1 year)', recommendation: 'vue' },
        { value: 'intermediate', label: 'Intermediate (1-3 years)', recommendation: 'react' },
        { value: 'advanced', label: 'Advanced (3+ years)', recommendation: 'angular' },
      ],
    },
    {
      id: 'project_size',
      question: 'What is the expected size and complexity of your project?',
      options: [
        { value: 'small', label: 'Small (< 10 components)', recommendation: 'vue' },
        { value: 'medium', label: 'Medium (10-50 components)', recommendation: 'react' },
        { value: 'large', label: 'Large (50+ components)', recommendation: 'angular' },
      ],
    },
    {
      id: 'typescript_requirement',
      question: 'Is TypeScript a requirement for your project?',
      options: [
        { value: 'required', label: 'Required', recommendation: 'angular' },
        { value: 'preferred', label: 'Preferred', recommendation: 'react' },
        { value: 'optional', label: 'Optional', recommendation: 'vue' },
      ],
    },
  ],

  generateRecommendation(answers: Record<string, string>): FrameworkRecommendation {
    const scores = {
      react: 0,
      vue: 0,
      angular: 0,
    }

    // Score based on answers
    Object.values(answers).forEach(answer => {
      const question = this.questions.find(q => q.options.some(o => o.value === answer))
      if (question) {
        const option = question.options.find(o => o.value === answer)
        if (option) {
          scores[option.recommendation]++
        }
      }
    })

    const recommended = Object.entries(scores).reduce((a, b) =>
      scores[a[0]] > scores[b[0]] ? a : b,
    )[0]

    return {
      recommended,
      score: scores[recommended],
      confidence: this.calculateConfidence(scores),
      rationale: this.generateRationale(answers, recommended),
    }
  },
}
```

## Backend Framework Selection

### Node.js Framework Comparison

```typescript
const backendFrameworkComparison = {
  express: {
    name: 'Express.js',
    version: '4.x',
    type: FrameworkType.MINIMAL,

    strengths: [
      'Minimal and unopinionated',
      'Large ecosystem',
      'Flexibility',
      'Great for APIs',
      'Extensive middleware',
      'Low learning curve',
    ],

    weaknesses: [
      'Requires many dependencies',
      'No built-in structure',
      'Manual security setup',
      'Performance limitations',
    ],

    idealFor: ['REST APIs', 'Microservices', 'Simple web applications', 'Learning projects'],

    benchmarks: {
      requestsPerSecond: 12000,
      memoryUsage: '50MB',
      startupTime: '200ms',
    },
  },

  nestjs: {
    name: 'NestJS',
    version: '10.x',
    type: FrameworkType.OPINIONATED,

    strengths: [
      'TypeScript first',
      'Decorator-based architecture',
      'Built-in dependency injection',
      'Modular structure',
      'Enterprise-ready',
      'Excellent documentation',
    ],

    weaknesses: [
      'Steeper learning curve',
      'Overhead for simple apps',
      'Angular-like complexity',
      'Larger bundle size',
    ],

    idealFor: [
      'Enterprise applications',
      'Complex business logic',
      'Teams familiar with Angular',
      'Long-term projects',
    ],

    benchmarks: {
      requestsPerSecond: 10000,
      memoryUsage: '80MB',
      startupTime: '800ms',
    },
  },

  fastify: {
    name: 'Fastify',
    version: '4.x',
    type: FrameworkType.PERFORMANCE,

    strengths: [
      'High performance',
      'Low overhead',
      'Schema-based validation',
      'Plugin architecture',
      'TypeScript support',
      'JSON schema validation',
    ],

    weaknesses: [
      'Smaller ecosystem',
      'Less middleware available',
      'Different API from Express',
      'Learning curve for schemas',
    ],

    idealFor: [
      'High-performance APIs',
      'CPU-intensive applications',
      'Performance-critical systems',
      'Modern TypeScript projects',
    ],

    benchmarks: {
      requestsPerSecond: 30000,
      memoryUsage: '35MB',
      startupTime: '150ms',
    },
  },
}

const backendFrameworkSelector = {
  selectFramework(requirements: BackendRequirements): FrameworkRecommendation {
    const scores = this.calculateScores(requirements)
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a)

    return {
      recommended: sorted[0][0],
      score: sorted[0][1],
      alternatives: sorted.slice(1).map(([name, score]) => ({ name, score })),
      rationale: this.generateRationale(requirements, sorted[0][0]),
    }
  },

  calculateScores(requirements: BackendRequirements): Record<string, number> {
    const scores = { express: 0, nestjs: 0, fastify: 0 }

    // Performance requirements
    if (requirements.performance === 'high') {
      scores.fastify += 30
      scores.express += 10
      scores.nestjs += 5
    } else if (requirements.performance === 'medium') {
      scores.express += 25
      scores.fastify += 20
      scores.nestjs += 15
    }

    // Project complexity
    if (requirements.complexity === 'high') {
      scores.nestjs += 30
      scores.express += 10
      scores.fastify += 15
    } else if (requirements.complexity === 'medium') {
      scores.express += 25
      scores.nestjs += 20
      scores.fastify += 20
    } else {
      scores.express += 30
      scores.fastify += 20
      scores.nestjs += 10
    }

    // TypeScript preference
    if (requirements.typescript === 'required') {
      scores.nestjs += 25
      scores.fastify += 20
      scores.express += 10
    }

    // Team experience
    if (requirements.teamExperience === 'beginner') {
      scores.express += 25
      scores.nestjs += 5
      scores.fastify += 10
    } else if (requirements.teamExperience === 'advanced') {
      scores.nestjs += 20
      scores.fastify += 15
      scores.express += 15
    }

    return scores
  },
}
```

## Database Framework Selection

### ORM/Query Builder Comparison

```typescript
const databaseFrameworkComparison = {
  typeorm: {
    name: 'TypeORM',
    type: 'ORM',

    strengths: [
      'TypeScript decorators',
      'Active Record and Data Mapper patterns',
      'Migration system',
      'Multiple database support',
      'Relations support',
      'Query builder',
    ],

    weaknesses: [
      'Performance overhead',
      'Complex queries can be difficult',
      'Learning curve for advanced features',
      'Migration issues',
    ],

    bestFor: [
      'TypeScript projects',
      'Rapid development',
      'Complex relationships',
      'Enterprise applications',
    ],
  },

  prisma: {
    name: 'Prisma',
    type: 'Modern ORM',

    strengths: [
      'Type-safe database client',
      'Intuitive schema definition',
      'Excellent migration system',
      'Auto-generated types',
      'Great developer experience',
      'Built-in connection pooling',
    ],

    weaknesses: [
      'Limited custom query support',
      'Relatively new ecosystem',
      'Performance overhead',
      'Vendor lock-in concerns',
    ],

    bestFor: [
      'Greenfield projects',
      'Developer experience priority',
      'Type safety requirements',
      'Modern application architecture',
    ],
  },

  knex: {
    name: 'Knex.js',
    type: 'Query Builder',

    strengths: [
      'Raw SQL flexibility',
      'Excellent performance',
      'Migration system',
      'Transaction support',
      'Multiple database support',
      'Minimal overhead',
    ],

    weaknesses: [
      'No type safety',
      'Manual relationship handling',
      'More boilerplate code',
      'SQL knowledge required',
    ],

    bestFor: [
      'Performance-critical applications',
      'Complex queries',
      'SQL-experienced teams',
      'Fine-grained control needs',
    ],
  },
}

const databaseFrameworkDecisionMatrix = {
  criteria: [
    {
      name: 'Type Safety',
      weight: 0.25,
      scores: { typeorm: 8, prisma: 10, knex: 3 },
    },
    {
      name: 'Performance',
      weight: 0.2,
      scores: { typeorm: 6, prisma: 7, knex: 9 },
    },
    {
      name: 'Developer Experience',
      weight: 0.2,
      scores: { typeorm: 7, prisma: 10, knex: 5 },
    },
    {
      name: 'Flexibility',
      weight: 0.15,
      scores: { typeorm: 8, prisma: 6, knex: 10 },
    },
    {
      name: 'Ecosystem',
      weight: 0.1,
      scores: { typeorm: 9, prisma: 7, knex: 8 },
    },
    {
      name: 'Learning Curve',
      weight: 0.1,
      scores: { typeorm: 6, prisma: 9, knex: 7 },
    },
  ],

  calculateScore(framework: string): number {
    return this.criteria.reduce((total, criterion) => {
      return total + criterion.scores[framework] * criterion.weight
    }, 0)
  },

  generateRecommendation(
    projectRequirements: DatabaseRequirements,
  ): DatabaseFrameworkRecommendation {
    const scores = {
      typeorm: this.calculateScore('typeorm'),
      prisma: this.calculateScore('prisma'),
      knex: this.calculateScore('knex'),
    }

    // Adjust scores based on specific requirements
    if (projectRequirements.typeSafety === 'critical') {
      scores.prisma += 1
      scores.typeorm += 0.5
    }

    if (projectRequirements.performance === 'critical') {
      scores.knex += 1
      scores.prisma -= 0.5
    }

    if (projectRequirements.complexity === 'high') {
      scores.knex += 0.5
      scores.typeorm += 0.3
    }

    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a)

    return {
      recommended: sorted[0][0],
      score: sorted[0][1],
      alternatives: sorted.slice(1),
      reasoning: this.generateReasoning(projectRequirements, sorted[0][0]),
    }
  },
}
```

This comprehensive framework selection guide ensures informed decisions based on objective criteria, project requirements, and team capabilities while providing clear rationale for technology choices.

---

**Skill**: Use `/pair-capability-assess-stack` to evaluate and adopt tech stack choices from these guidelines via the resolution cascade.
