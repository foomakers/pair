# Cloud Provider Evaluation Framework

Comprehensive framework for evaluating and selecting cloud providers based on technical requirements, business needs, and strategic objectives.

## When to Use

**Essential for:**

- New project cloud provider selection
- Multi-cloud strategy development
- Cloud migration planning
- Vendor risk assessment and mitigation
- Cost optimization and budget planning
- Compliance and regulatory requirements

**Consider alternatives for:**

- Single-provider locked-in scenarios
- Simple proof-of-concept projects
- Legacy system maintenance without migration plans

## Evaluation Framework Overview

### 1. Provider Comparison Matrix

```typescript
interface CloudProviderEvaluation {
  provider: CloudProvider
  scoring: EvaluationScoring
  technical_capabilities: TechnicalCapabilities
  business_factors: BusinessFactors
  strategic_fit: StrategicFit
  risk_assessment: RiskAssessment
}

interface CloudProvider {
  name: string
  tier: 'hyperscale' | 'regional' | 'specialized' | 'niche'
  market_presence: MarketPresence
  service_portfolio: ServicePortfolio
  global_footprint: GlobalFootprint
}

interface EvaluationScoring {
  overall_score: number
  weighted_categories: WeightedCategory[]
  decision_matrix: DecisionMatrix
  confidence_level: number
}

interface WeightedCategory {
  category: EvaluationCategory
  weight: number
  score: number
  rationale: string
  supporting_evidence: string[]
}

// Example: Comprehensive Provider Evaluation
const providerEvaluationMatrix: CloudProviderEvaluation[] = [
  {
    provider: {
      name: 'AWS',
      tier: 'hyperscale',
      market_presence: {
        market_share: 0.32,
        years_in_market: 17,
        enterprise_adoption: 'very_high',
        startup_adoption: 'high',
      },
      service_portfolio: {
        compute_services: 25,
        storage_services: 15,
        database_services: 20,
        ai_ml_services: 30,
        specialized_services: 200,
      },
      global_footprint: {
        regions: 31,
        availability_zones: 99,
        edge_locations: 450,
        countries: 245,
      },
    },
    scoring: {
      overall_score: 8.7,
      weighted_categories: [
        {
          category: 'technical_capabilities',
          weight: 0.3,
          score: 9.2,
          rationale: 'Comprehensive service portfolio with advanced ML/AI offerings',
          supporting_evidence: [
            'Most extensive service catalog',
            'Advanced AI/ML services (SageMaker, Bedrock)',
            'Mature serverless ecosystem',
            'Best-in-class container orchestration',
          ],
        },
        {
          category: 'cost_efficiency',
          weight: 0.25,
          score: 7.8,
          rationale: 'Competitive pricing with extensive cost optimization tools',
          supporting_evidence: [
            'Reserved instance discounts up to 75%',
            'Spot instances for batch workloads',
            'Cost optimization tools (Cost Explorer, Trusted Advisor)',
            'Free tier for experimentation',
          ],
        },
        {
          category: 'reliability_performance',
          weight: 0.2,
          score: 9.0,
          rationale: 'Industry-leading SLAs and proven track record',
          supporting_evidence: [
            '99.99% SLA for most services',
            'Multi-AZ redundancy',
            'Proven disaster recovery capabilities',
            'Extensive monitoring and alerting',
          ],
        },
        {
          category: 'security_compliance',
          weight: 0.15,
          score: 9.5,
          rationale: 'Most comprehensive security and compliance offerings',
          supporting_evidence: [
            'SOC 1/2/3, PCI DSS, HIPAA, FedRAMP',
            'Advanced security services (GuardDuty, SecurityHub)',
            'Identity and access management (IAM)',
            'Data encryption and key management',
          ],
        },
        {
          category: 'developer_experience',
          weight: 0.1,
          score: 8.5,
          rationale: 'Excellent tooling and documentation',
          supporting_evidence: [
            'Comprehensive SDK support',
            'CLI tools and Infrastructure as Code',
            'Extensive documentation and tutorials',
            'Large community and ecosystem',
          ],
        },
      ],
      decision_matrix: {
        strengths: [
          'Market leader with proven track record',
          'Most comprehensive service portfolio',
          'Best enterprise support and consulting',
          'Advanced AI/ML and analytics capabilities',
        ],
        weaknesses: [
          'Can be expensive for small workloads',
          'Complex pricing model',
          'Vendor lock-in risk with proprietary services',
          'Learning curve for new users',
        ],
        opportunities: [
          'Cost optimization through reserved instances',
          'Innovation through new service adoption',
          'Global expansion capabilities',
          'AI/ML competitive advantage',
        ],
        threats: [
          'Pricing changes and cost increases',
          'Service deprecation risk',
          'Competition from other hyperscalers',
          'Regulatory changes affecting availability',
        ],
      },
      confidence_level: 0.95,
    },
    technical_capabilities: {
      compute: {
        vm_types: 400,
        serverless: ['Lambda', 'Fargate'],
        containers: ['ECS', 'EKS'],
        bare_metal: true,
        gpu_compute: ['P4', 'G4', 'Inf1'],
        edge_compute: ['Wavelength', 'Outposts'],
      },
      storage: {
        object_storage: 'S3',
        block_storage: 'EBS',
        file_storage: 'EFS',
        archive_storage: 'Glacier',
        content_delivery: 'CloudFront',
        backup_solutions: 'AWS Backup',
      },
      databases: {
        relational: ['RDS', 'Aurora'],
        nosql: ['DynamoDB', 'DocumentDB'],
        in_memory: ['ElastiCache', 'MemoryDB'],
        analytics: ['Redshift', 'Timestream'],
        graph: 'Neptune',
        search: 'OpenSearch',
      },
      networking: {
        virtual_networks: 'VPC',
        load_balancing: ['ALB', 'NLB', 'CLB'],
        dns: 'Route 53',
        api_gateway: 'API Gateway',
        private_connectivity: ['Direct Connect', 'VPN'],
        security_groups: true,
      },
      ai_ml: {
        managed_ml: 'SageMaker',
        pre_trained_apis: ['Rekognition', 'Comprehend', 'Translate'],
        llm_services: 'Bedrock',
        data_analytics: ['EMR', 'Glue', 'Athena'],
        streaming: 'Kinesis',
        workflow: 'Step Functions',
      },
    },
    business_factors: {
      pricing_model: {
        pay_as_you_go: true,
        reserved_instances: true,
        savings_plans: true,
        spot_pricing: true,
        free_tier: true,
        enterprise_agreements: true,
      },
      support_options: {
        basic: 'free',
        developer: '$29/month',
        business: '$100/month',
        enterprise: '$15000/month',
        premium_support: 'available',
        professional_services: 'extensive',
      },
      marketplace: {
        third_party_solutions: 8000,
        integration_partners: 'extensive',
        consulting_partners: 'global_network',
        certification_programs: 'comprehensive',
      },
    },
    strategic_fit: {
      innovation_pace: 'very_high',
      roadmap_alignment: 'excellent',
      vendor_relationship: 'strategic_partner',
      skills_availability: 'high',
      training_resources: 'extensive',
      community_support: 'very_active',
    },
    risk_assessment: {
      vendor_lock_in: 'medium_high',
      technology_risk: 'low',
      financial_risk: 'low',
      compliance_risk: 'very_low',
      operational_risk: 'low',
      mitigation_strategies: [
        'Multi-cloud architecture for critical workloads',
        'Use of open standards and portable technologies',
        'Regular cost optimization reviews',
        'Disaster recovery across regions',
      ],
    },
  },
  {
    provider: {
      name: 'Google Cloud Platform',
      tier: 'hyperscale',
      market_presence: {
        market_share: 0.11,
        years_in_market: 14,
        enterprise_adoption: 'medium',
        startup_adoption: 'high',
      },
      service_portfolio: {
        compute_services: 15,
        storage_services: 8,
        database_services: 12,
        ai_ml_services: 25,
        specialized_services: 100,
      },
      global_footprint: {
        regions: 35,
        availability_zones: 106,
        edge_locations: 140,
        countries: 200,
      },
    },
    scoring: {
      overall_score: 8.3,
      weighted_categories: [
        {
          category: 'technical_capabilities',
          weight: 0.3,
          score: 8.8,
          rationale: 'Strong in AI/ML and data analytics, innovative Kubernetes',
          supporting_evidence: [
            'Leading AI/ML platform (Vertex AI)',
            'Native Kubernetes (GKE) with advanced features',
            'BigQuery for analytics',
            'Strong data engineering tools',
          ],
        },
        {
          category: 'cost_efficiency',
          weight: 0.25,
          score: 8.5,
          rationale: 'Competitive pricing with automatic discounts',
          supporting_evidence: [
            'Sustained use discounts automatically applied',
            'Committed use discounts up to 70%',
            'Preemptible instances for batch workloads',
            'Per-second billing for most services',
          ],
        },
        {
          category: 'reliability_performance',
          weight: 0.2,
          score: 8.2,
          rationale: 'Good reliability with some service limitations',
          supporting_evidence: [
            '99.95% SLA for most services',
            'Multi-zone redundancy',
            "Google's global network infrastructure",
            'Live migration for VMs',
          ],
        },
        {
          category: 'security_compliance',
          weight: 0.15,
          score: 8.7,
          rationale: "Strong security with Google's expertise",
          supporting_evidence: [
            'SOC 1/2/3, ISO 27001, PCI DSS',
            'Binary Authorization for containers',
            'Identity-Aware Proxy',
            'Customer-managed encryption keys',
          ],
        },
        {
          category: 'developer_experience',
          weight: 0.1,
          score: 7.8,
          rationale: 'Good tooling but smaller ecosystem',
          supporting_evidence: [
            'Clean, intuitive console interface',
            'gcloud CLI and client libraries',
            'Cloud Shell for development',
            'Growing but smaller community',
          ],
        },
      ],
      decision_matrix: {
        strengths: [
          'Leading AI/ML and data analytics capabilities',
          'Kubernetes-native platform',
          'Competitive pricing with automatic discounts',
          'Clean, developer-friendly interface',
        ],
        weaknesses: [
          'Smaller service portfolio compared to AWS',
          'Less enterprise adoption',
          'Limited third-party marketplace',
          'Fewer compliance certifications',
        ],
        opportunities: [
          'AI/ML first-mover advantage',
          'Data analytics and BigQuery differentiation',
          'Kubernetes ecosystem leadership',
          'Sustainability and carbon neutrality',
        ],
        threats: [
          'Market share pressure from AWS and Azure',
          "Google's history of discontinuing services",
          'Enterprise perception challenges',
          'Limited enterprise sales presence',
        ],
      },
      confidence_level: 0.85,
    },
    technical_capabilities: {
      compute: {
        vm_types: 50,
        serverless: ['Cloud Functions', 'Cloud Run'],
        containers: ['GKE', 'Cloud Run'],
        bare_metal: false,
        gpu_compute: ['A100', 'V100', 'TPU'],
        edge_compute: ['Anthos', 'Edge TPU'],
      },
      storage: {
        object_storage: 'Cloud Storage',
        block_storage: 'Persistent Disk',
        file_storage: 'Filestore',
        archive_storage: 'Archive Storage',
        content_delivery: 'Cloud CDN',
        backup_solutions: 'Cloud Storage',
      },
      databases: {
        relational: ['Cloud SQL', 'Cloud Spanner'],
        nosql: ['Firestore', 'Bigtable'],
        in_memory: ['Memorystore'],
        analytics: ['BigQuery'],
        graph: 'limited',
        search: 'limited',
      },
      networking: {
        virtual_networks: 'VPC',
        load_balancing: ['Cloud Load Balancing'],
        dns: 'Cloud DNS',
        api_gateway: 'API Gateway',
        private_connectivity: ['Cloud Interconnect', 'VPN'],
        security_groups: 'Firewall Rules',
      },
      ai_ml: {
        managed_ml: 'Vertex AI',
        pre_trained_apis: ['Vision API', 'Natural Language API'],
        llm_services: 'PaLM API',
        data_analytics: ['BigQuery', 'Dataflow'],
        streaming: 'Pub/Sub',
        workflow: 'Cloud Workflows',
      },
    },
    business_factors: {
      pricing_model: {
        pay_as_you_go: true,
        reserved_instances: 'Committed Use',
        savings_plans: false,
        spot_pricing: 'Preemptible',
        free_tier: true,
        enterprise_agreements: true,
      },
      support_options: {
        basic: 'free',
        developer: '$100/month',
        production: '$500/month',
        premium: '$12500/month',
        premium_support: 'available',
        professional_services: 'growing',
      },
      marketplace: {
        third_party_solutions: 1000,
        integration_partners: 'growing',
        consulting_partners: 'expanding',
        certification_programs: 'developing',
      },
    },
    strategic_fit: {
      innovation_pace: 'high',
      roadmap_alignment: 'good',
      vendor_relationship: 'technology_partner',
      skills_availability: 'medium',
      training_resources: 'good',
      community_support: 'active',
    },
    risk_assessment: {
      vendor_lock_in: 'medium',
      technology_risk: 'medium',
      financial_risk: 'low',
      compliance_risk: 'low',
      operational_risk: 'medium',
      mitigation_strategies: [
        'Focus on portable Kubernetes workloads',
        'Use standard APIs and open source tools',
        'Regular backup and disaster recovery testing',
        "Monitor Google's service announcements",
      ],
    },
  },
  {
    provider: {
      name: 'Microsoft Azure',
      tier: 'hyperscale',
      market_presence: {
        market_share: 0.23,
        years_in_market: 14,
        enterprise_adoption: 'very_high',
        startup_adoption: 'medium',
      },
      service_portfolio: {
        compute_services: 20,
        storage_services: 12,
        database_services: 15,
        ai_ml_services: 20,
        specialized_services: 150,
      },
      global_footprint: {
        regions: 60,
        availability_zones: 140,
        edge_locations: 170,
        countries: 140,
      },
    },
    scoring: {
      overall_score: 8.4,
      weighted_categories: [
        {
          category: 'technical_capabilities',
          weight: 0.3,
          score: 8.5,
          rationale: 'Strong enterprise integration and hybrid cloud capabilities',
          supporting_evidence: [
            'Excellent Microsoft ecosystem integration',
            'Strong hybrid cloud with Azure Arc',
            'Comprehensive AI services',
            'Enterprise-grade networking',
          ],
        },
        {
          category: 'cost_efficiency',
          weight: 0.25,
          score: 8.0,
          rationale: 'Competitive with Microsoft licensing benefits',
          supporting_evidence: [
            'Azure Hybrid Benefit for Windows/SQL Server',
            'Reserved instances up to 72% savings',
            'Spot instances available',
            'Cost management and budgeting tools',
          ],
        },
        {
          category: 'reliability_performance',
          weight: 0.2,
          score: 8.3,
          rationale: 'Strong SLAs with extensive global presence',
          supporting_evidence: [
            '99.99% SLA for premium services',
            'Availability zones and regions',
            'Traffic Manager for global load balancing',
            'Site Recovery for disaster recovery',
          ],
        },
        {
          category: 'security_compliance',
          weight: 0.15,
          score: 9.0,
          rationale: 'Excellent enterprise security and compliance',
          supporting_evidence: [
            'Most compliance certifications',
            'Azure Active Directory integration',
            'Microsoft Defender for Cloud',
            'Government cloud offerings',
          ],
        },
        {
          category: 'developer_experience',
          weight: 0.1,
          score: 8.2,
          rationale: 'Good tooling with strong Visual Studio integration',
          supporting_evidence: [
            'Excellent Visual Studio integration',
            'Azure CLI and PowerShell support',
            'Comprehensive documentation',
            'Strong .NET ecosystem',
          ],
        },
      ],
      decision_matrix: {
        strengths: [
          'Strongest enterprise and Microsoft ecosystem integration',
          'Excellent hybrid and multi-cloud capabilities',
          'Most compliance certifications globally',
          'Strong partner and consulting ecosystem',
        ],
        weaknesses: [
          'Complex pricing and licensing model',
          'Can be expensive for non-Microsoft workloads',
          'Learning curve for non-Microsoft developers',
          'Some services lag behind AWS in maturity',
        ],
        opportunities: [
          'Enterprise digital transformation projects',
          'Hybrid cloud modernization',
          'Microsoft 365 and Teams integration',
          'AI and Copilot integration across products',
        ],
        threats: [
          'Vendor lock-in with Microsoft ecosystem',
          'Licensing complexity and audit risk',
          'Competition from cloud-native providers',
          'Technology shift away from Microsoft stack',
        ],
      },
      confidence_level: 0.9,
    },
    technical_capabilities: {
      compute: {
        vm_types: 100,
        serverless: ['Azure Functions', 'Container Instances'],
        containers: ['AKS', 'Container Instances'],
        bare_metal: 'Azure Dedicated Host',
        gpu_compute: ['NC', 'ND', 'NV series'],
        edge_compute: ['Azure Stack Edge', 'IoT Edge'],
      },
      storage: {
        object_storage: 'Blob Storage',
        block_storage: 'Managed Disks',
        file_storage: 'Azure Files',
        archive_storage: 'Archive tier',
        content_delivery: 'Azure CDN',
        backup_solutions: 'Azure Backup',
      },
      databases: {
        relational: ['Azure SQL', 'PostgreSQL', 'MySQL'],
        nosql: ['Cosmos DB'],
        in_memory: ['Cache for Redis'],
        analytics: ['Synapse Analytics'],
        graph: 'Cosmos DB Gremlin',
        search: 'Cognitive Search',
      },
      networking: {
        virtual_networks: 'Virtual Network',
        load_balancing: ['Load Balancer', 'Application Gateway'],
        dns: 'Azure DNS',
        api_gateway: 'API Management',
        private_connectivity: ['ExpressRoute', 'VPN Gateway'],
        security_groups: 'Network Security Groups',
      },
      ai_ml: {
        managed_ml: 'Azure Machine Learning',
        pre_trained_apis: ['Cognitive Services'],
        llm_services: 'Azure OpenAI Service',
        data_analytics: ['Synapse', 'Data Factory'],
        streaming: 'Event Hubs',
        workflow: 'Logic Apps',
      },
    },
    business_factors: {
      pricing_model: {
        pay_as_you_go: true,
        reserved_instances: true,
        savings_plans: 'Azure Savings Plans',
        spot_pricing: 'Spot VMs',
        free_tier: true,
        enterprise_agreements: 'EA and CSP',
      },
      support_options: {
        basic: 'free',
        developer: '$29/month',
        standard: '$100/month',
        professional_direct: '$1000/month',
        premier: 'custom',
        professional_services: 'extensive',
      },
      marketplace: {
        third_party_solutions: 5000,
        integration_partners: 'extensive',
        consulting_partners: 'global_network',
        certification_programs: 'comprehensive',
      },
    },
    strategic_fit: {
      innovation_pace: 'high',
      roadmap_alignment: 'very_good',
      vendor_relationship: 'strategic_partner',
      skills_availability: 'high',
      training_resources: 'extensive',
      community_support: 'active',
    },
    risk_assessment: {
      vendor_lock_in: 'high',
      technology_risk: 'low',
      financial_risk: 'low',
      compliance_risk: 'very_low',
      operational_risk: 'low',
      mitigation_strategies: [
        'Use open standards and portable technologies',
        'Implement multi-cloud for critical workloads',
        'Regular licensing and cost reviews',
        'Cross-training on alternative platforms',
      ],
    },
  },
]
```

### 2. Decision Framework Implementation

```typescript
interface ProviderSelectionFramework {
  evaluation_criteria: EvaluationCriteria
  decision_process: DecisionProcess
  scoring_methodology: ScoringMethodology
  risk_framework: RiskFramework
}

interface EvaluationCriteria {
  technical_requirements: TechnicalRequirement[]
  business_requirements: BusinessRequirement[]
  strategic_requirements: StrategicRequirement[]
  weights: CriteriaWeights
}

interface DecisionProcess {
  phases: DecisionPhase[]
  stakeholders: Stakeholder[]
  governance: DecisionGovernance
  timeline: DecisionTimeline
}

class CloudProviderSelector {
  constructor(
    private requirements: ProjectRequirements,
    private constraints: ProjectConstraints,
    private weightingStrategy: WeightingStrategy,
  ) {}

  async evaluateProviders(candidates: CloudProvider[]): Promise<ProviderEvaluationResult> {
    const evaluations: ProviderEvaluation[] = []

    for (const provider of candidates) {
      const evaluation = await this.evaluateProvider(provider)
      evaluations.push(evaluation)
    }

    const ranking = this.rankProviders(evaluations)
    const recommendation = await this.generateRecommendation(ranking)

    return {
      evaluations,
      ranking,
      recommendation,
      decision_rationale: this.buildDecisionRationale(ranking),
      implementation_roadmap: await this.createImplementationRoadmap(recommendation),
    }
  }

  private async evaluateProvider(provider: CloudProvider): Promise<ProviderEvaluation> {
    // Technical capabilities assessment
    const technicalScore = await this.assessTechnicalCapabilities(provider)

    // Business factors evaluation
    const businessScore = await this.assessBusinessFactors(provider)

    // Strategic fit analysis
    const strategicScore = await this.assessStrategicFit(provider)

    // Risk assessment
    const riskScore = await this.assessRisk(provider)

    // Calculate weighted overall score
    const overallScore = this.calculateWeightedScore({
      technical: technicalScore,
      business: businessScore,
      strategic: strategicScore,
      risk: riskScore,
    })

    return {
      provider,
      scores: {
        technical: technicalScore,
        business: businessScore,
        strategic: strategicScore,
        risk: riskScore,
        overall: overallScore,
      },
      strengths: await this.identifyStrengths(provider),
      weaknesses: await this.identifyWeaknesses(provider),
      fit_analysis: await this.analyzeFit(provider),
      recommendation_confidence: this.calculateConfidence(overallScore),
    }
  }

  private async assessTechnicalCapabilities(provider: CloudProvider): Promise<TechnicalScore> {
    const capabilities = await this.getProviderCapabilities(provider)
    const requirements = this.requirements.technical

    const scores: Record<string, number> = {}

    // Compute services evaluation
    scores.compute = this.evaluateComputeServices(capabilities.compute, requirements.compute)

    // Storage services evaluation
    scores.storage = this.evaluateStorageServices(capabilities.storage, requirements.storage)

    // Database services evaluation
    scores.databases = this.evaluateDatabaseServices(capabilities.databases, requirements.databases)

    // Networking evaluation
    scores.networking = this.evaluateNetworking(capabilities.networking, requirements.networking)

    // AI/ML services evaluation
    scores.ai_ml = this.evaluateAIMLServices(capabilities.ai_ml, requirements.ai_ml)

    // Security services evaluation
    scores.security = this.evaluateSecurityServices(capabilities.security, requirements.security)

    return {
      category_scores: scores,
      overall_score: this.calculateCategoryAverage(scores),
      gaps: this.identifyCapabilityGaps(capabilities, requirements),
      strengths: this.identifyCapabilityStrengths(capabilities, requirements),
    }
  }

  private evaluateComputeServices(
    capabilities: ComputeCapabilities,
    requirements: ComputeRequirements,
  ): number {
    let score = 0
    let maxScore = 0

    // VM types and sizes
    if (requirements.vm_flexibility) {
      maxScore += 20
      score += Math.min(20, capabilities.vm_types / 10)
    }

    // Serverless capabilities
    if (requirements.serverless) {
      maxScore += 25
      if (capabilities.serverless.length > 0) {
        score += 25
      }
    }

    // Container support
    if (requirements.containers) {
      maxScore += 25
      if (capabilities.containers.length > 0) {
        score += 25
      }
    }

    // GPU compute
    if (requirements.gpu_compute) {
      maxScore += 15
      if (capabilities.gpu_compute.length > 0) {
        score += 15
      }
    }

    // Edge computing
    if (requirements.edge_computing) {
      maxScore += 15
      if (capabilities.edge_compute.length > 0) {
        score += 15
      }
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 100
  }

  private async assessBusinessFactors(provider: CloudProvider): Promise<BusinessScore> {
    const factors = await this.getBusinessFactors(provider)
    const requirements = this.requirements.business

    const scores: Record<string, number> = {}

    // Cost efficiency
    scores.cost = this.evaluateCostEfficiency(
      factors.pricing_model,
      requirements.budget_constraints,
    )

    // Support quality
    scores.support = this.evaluateSupportOptions(
      factors.support_options,
      requirements.support_needs,
    )

    // Market ecosystem
    scores.ecosystem = this.evaluateEcosystem(factors.marketplace, requirements.integration_needs)

    // Vendor stability
    scores.stability = this.evaluateVendorStability(
      provider.market_presence,
      requirements.risk_tolerance,
    )

    return {
      category_scores: scores,
      overall_score: this.calculateCategoryAverage(scores),
      cost_projection: await this.projectCosts(provider),
      roi_analysis: await this.analyzeROI(provider),
    }
  }

  private rankProviders(evaluations: ProviderEvaluation[]): ProviderRanking {
    const ranked = evaluations
      .sort((a, b) => b.scores.overall.overall_score - a.scores.overall.overall_score)
      .map((evaluation, index) => ({
        rank: index + 1,
        provider: evaluation.provider,
        score: evaluation.scores.overall.overall_score,
        evaluation: evaluation,
      }))

    return {
      providers: ranked,
      top_choice: ranked[0],
      alternatives: ranked.slice(1, 3),
      ranking_rationale: this.explainRanking(ranked),
    }
  }

  private async generateRecommendation(ranking: ProviderRanking): Promise<ProviderRecommendation> {
    const topChoice = ranking.top_choice

    return {
      primary_recommendation: {
        provider: topChoice.provider,
        rationale: this.buildRecommendationRationale(topChoice),
        implementation_approach: await this.defineImplementationApproach(topChoice),
        success_metrics: this.defineSuccessMetrics(topChoice),
        timeline: this.estimateImplementationTimeline(topChoice),
      },
      fallback_options: await this.defineFallbackOptions(ranking.alternatives),
      multi_cloud_strategy: await this.evaluateMultiCloudOptions(ranking),
      decision_points: this.identifyDecisionPoints(ranking),
      next_steps: this.defineNextSteps(topChoice),
    }
  }
}
```

### 3. Cost Analysis Framework

```typescript
interface CostAnalysisFramework {
  cost_modeling: CostModeling
  optimization_strategies: OptimizationStrategy[]
  budget_planning: BudgetPlanning
  monitoring: CostMonitoring
}

interface CostModeling {
  workload_analysis: WorkloadAnalysis
  pricing_models: PricingModel[]
  cost_projections: CostProjection[]
  scenario_analysis: ScenarioAnalysis
}

class CloudCostAnalyzer {
  constructor(
    private workloadProfile: WorkloadProfile,
    private growthProjections: GrowthProjection[],
  ) {}

  async analyzeCosts(
    providers: CloudProvider[],
    timeHorizon: number = 36, // months
  ): Promise<CostAnalysisResult> {
    const analyses: ProviderCostAnalysis[] = []

    for (const provider of providers) {
      const analysis = await this.analyzeProviderCosts(provider, timeHorizon)
      analyses.push(analysis)
    }

    const comparison = this.compareCosts(analyses)
    const recommendations = await this.generateCostRecommendations(comparison)

    return {
      provider_analyses: analyses,
      cost_comparison: comparison,
      recommendations: recommendations,
      sensitivity_analysis: await this.performSensitivityAnalysis(analyses),
      optimization_opportunities: await this.identifyOptimizationOpportunities(analyses),
    }
  }

  private async analyzeProviderCosts(
    provider: CloudProvider,
    timeHorizon: number,
  ): Promise<ProviderCostAnalysis> {
    // Get pricing information
    const pricing = await this.getProviderPricing(provider)

    // Model workload costs
    const workloadCosts = await this.modelWorkloadCosts(provider, pricing)

    // Project growth impact
    const growthImpact = this.projectGrowthImpact(workloadCosts, timeHorizon)

    // Calculate optimization potential
    const optimizations = await this.calculateOptimizations(provider, workloadCosts)

    // Generate cost timeline
    const timeline = this.generateCostTimeline(workloadCosts, growthImpact, timeHorizon)

    return {
      provider,
      baseline_costs: workloadCosts,
      projected_timeline: timeline,
      total_cost_3year: timeline[timeline.length - 1].cumulative_cost,
      optimization_potential: optimizations,
      cost_breakdown: this.generateCostBreakdown(workloadCosts),
      assumptions: this.documentAssumptions(provider, workloadCosts),
    }
  }

  private async modelWorkloadCosts(
    provider: CloudProvider,
    pricing: ProviderPricing,
  ): Promise<WorkloadCosts> {
    const costs: WorkloadCosts = {
      compute: await this.calculateComputeCosts(provider, pricing),
      storage: await this.calculateStorageCosts(provider, pricing),
      networking: await this.calculateNetworkingCosts(provider, pricing),
      databases: await this.calculateDatabaseCosts(provider, pricing),
      services: await this.calculateServiceCosts(provider, pricing),
      support: await this.calculateSupportCosts(provider, pricing),
    }

    costs.monthly_total = Object.values(costs).reduce(
      (sum, cost) => sum + (typeof cost === 'number' ? cost : 0),
      0,
    )

    return costs
  }

  private async calculateComputeCosts(
    provider: CloudProvider,
    pricing: ProviderPricing,
  ): Promise<ComputeCosts> {
    const workloads = this.workloadProfile.compute_workloads
    let totalCosts: ComputeCosts = {
      vms: 0,
      serverless: 0,
      containers: 0,
      reserved_instances: 0,
      spot_instances: 0,
    }

    for (const workload of workloads) {
      switch (workload.type) {
        case 'vm':
          totalCosts.vms += this.calculateVMCosts(workload, pricing.compute.vms)
          break
        case 'serverless':
          totalCosts.serverless += this.calculateServerlessCosts(
            workload,
            pricing.compute.serverless,
          )
          break
        case 'container':
          totalCosts.containers += this.calculateContainerCosts(
            workload,
            pricing.compute.containers,
          )
          break
      }
    }

    // Apply optimization strategies
    const riSavings = this.calculateReservedInstanceSavings(
      totalCosts.vms,
      pricing.compute.reserved_discounts,
    )
    totalCosts.reserved_instances = riSavings.optimized_cost

    const spotSavings = this.calculateSpotInstanceSavings(workloads, pricing.compute.spot_discounts)
    totalCosts.spot_instances = spotSavings.optimized_cost

    return totalCosts
  }

  private generateCostComparison(analyses: ProviderCostAnalysis[]): CostComparison {
    const sortedByTotalCost = [...analyses].sort((a, b) => a.total_cost_3year - b.total_cost_3year)

    const baseline = sortedByTotalCost[0]

    return {
      cost_leader: baseline.provider,
      comparisons: sortedByTotalCost.map(analysis => ({
        provider: analysis.provider,
        total_cost_3year: analysis.total_cost_3year,
        difference_from_leader: analysis.total_cost_3year - baseline.total_cost_3year,
        percentage_difference:
          ((analysis.total_cost_3year - baseline.total_cost_3year) / baseline.total_cost_3year) *
          100,
        monthly_difference: (analysis.total_cost_3year - baseline.total_cost_3year) / 36,
        break_even_point: this.calculateBreakEvenPoint(baseline, analysis),
      })),
      cost_drivers: this.identifyCostDrivers(analyses),
      optimization_impact: this.calculateOptimizationImpact(analyses),
    }
  }
}
```

## Implementation Best Practices

### 1. Evaluation Process

- **Stakeholder Alignment**: Ensure all key stakeholders participate in requirements definition
- **Objective Criteria**: Use quantifiable metrics wherever possible
- **Real Workload Testing**: Test actual workloads, not synthetic benchmarks
- **Cost Modeling**: Model realistic usage patterns and growth scenarios
- **Risk Assessment**: Consider vendor lock-in, compliance, and operational risks

### 2. Decision Documentation

- **Decision Records**: Document evaluation criteria, process, and rationale
- **Assumptions**: Clearly document all assumptions and constraints
- **Alternative Analysis**: Explain why other options were rejected
- **Success Metrics**: Define measurable success criteria
- **Review Schedule**: Plan periodic reviews and reassessments

### 3. Implementation Strategy

- **Phased Approach**: Start with pilot projects before full migration
- **Skill Development**: Invest in team training and certification
- **Governance**: Establish cloud governance and cost management
- **Multi-Cloud Planning**: Consider multi-cloud strategy for risk mitigation
- **Exit Strategy**: Plan for potential provider changes

### 4. Ongoing Management

- **Cost Monitoring**: Implement comprehensive cost tracking and alerting
- **Performance Tracking**: Monitor performance against success metrics
- **Regular Reviews**: Schedule quarterly or annual provider assessments
- **Optimization**: Continuous optimization of costs and performance
- **Innovation Adoption**: Stay current with new services and capabilities

## Common Evaluation Scenarios

### 1. Startup/Small Business

```typescript
const startupEvaluation: EvaluationCriteria = {
  weights: {
    cost_efficiency: 0.4,
    ease_of_use: 0.25,
    scalability: 0.2,
    security: 0.15,
  },
  priorities: ['free_tier', 'pay_as_you_go', 'simple_pricing', 'good_documentation'],
}
```

### 2. Enterprise Migration

```typescript
const enterpriseEvaluation: EvaluationCriteria = {
  weights: {
    security_compliance: 0.3,
    enterprise_support: 0.25,
    integration_capabilities: 0.2,
    performance_reliability: 0.15,
    cost_optimization: 0.1,
  },
  priorities: [
    'compliance_certifications',
    'hybrid_cloud',
    'enterprise_support',
    'migration_tools',
  ],
}
```

### 3. AI/ML Workloads

```typescript
const aiMlEvaluation: EvaluationCriteria = {
  weights: {
    ai_ml_services: 0.35,
    gpu_compute: 0.25,
    data_services: 0.2,
    cost_efficiency: 0.2,
  },
  priorities: ['managed_ml_platforms', 'gpu_availability', 'data_analytics', 'model_deployment'],
}
```

## Implementation Checklist

### Preparation Phase

- [ ] Define project requirements and constraints
- [ ] Identify evaluation stakeholders and decision makers
- [ ] Establish evaluation criteria and weights
- [ ] Create evaluation timeline and milestones

### Evaluation Phase

- [ ] Collect provider information and capabilities
- [ ] Conduct technical capability assessments
- [ ] Perform cost analysis and projections
- [ ] Assess business and strategic factors
- [ ] Evaluate risks and mitigation strategies

### Decision Phase

- [ ] Compile evaluation results and rankings
- [ ] Generate recommendations and alternatives
- [ ] Document decision rationale and assumptions
- [ ] Get stakeholder approval and sign-off

### Implementation Phase

- [ ] Develop implementation roadmap and timeline
- [ ] Establish governance and cost management
- [ ] Plan training and skill development
- [ ] Set up monitoring and success metrics
- [ ] Execute phased implementation plan

## Related Patterns

- **[Multi-Cloud Strategy](multi-cloud.md)**: Strategies for using multiple cloud providers
- **[Cost Optimization](cost-optimization.md)**: Ongoing cost management and optimization
- **[Cloud Migration](../deployment/cloud-migration.md)**: Migration planning and execution

## References

- Cloud Provider Documentation and Pricing
- Industry Analysis Reports (Gartner, Forrester)
- Total Cost of Ownership (TCO) Calculators
- Cloud Adoption Framework Best Practices
