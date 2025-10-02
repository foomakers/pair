# Content Strategy Practice (Level 2)

Content strategy, information architecture, communication design, and content management for effective user communication and information discovery.

## Purpose

Define content strategy standards that ensure clear communication, effective information architecture, and consistent content management across all digital touchpoints.

## Scope

**In Scope:**

- Content strategy and planning
- Information architecture and navigation
- Writing guidelines and tone of voice
- Content accessibility and internationalization
- Content management and workflow

**Out of Scope:**

- Visual design implementation (see [Interface Design](interface-design.md))
- Component development (see [Design Systems](design-systems.md))
- User research methodologies (see [User Research](user-research.md))
- Technical content management implementation (see [Technical Standards](../technical-standards/README.md))

## Topics Covered

### Content Strategy and Planning

Strategic approach to content creation and management

- Content strategy development and goals
- Content audit and gap analysis
- Content governance and workflow
- Content performance measurement

### Information Architecture

Information organization and navigation design

- Information architecture principles
- Navigation design and taxonomy
- Content hierarchy and categorization
- Search and findability optimization

### Writing Guidelines

Content creation standards and voice guidelines

- Writing style and tone of voice
- Content formatting and structure
- Microcopy and interface text
- Error messages and feedback content

### Content Accessibility

Inclusive content design and internationalization

- Accessible content writing
- Internationalization and localization
- Multi-language content strategy
- Cultural sensitivity and inclusivity

## 🛠️ Level 3: Tool-Specific Implementations

### Content Implementation

- **[TypeScript](typescript.md)** - Type definitions and interfaces for content strategy
- **[Markdown Templates](markdown-templates.md)** - Structured content creation templates

### Internationalization

- **[Translation Management](translation-management.md)** - Multi-language content workflow
- **[CAT Tools](cat-tools.md)** - Computer-assisted translation for efficiency

## 📝 Content Strategy and Planning

### Content Strategy Framework

**Content Strategy Components**:

```typescript
interface ContentStrategy {
  brand: {
    voice: string
    tone: string[]
    personality: string[]
    values: string[]
  }
  audience: {
    primaryAudience: UserPersona[]
    secondaryAudience: UserPersona[]
    contentNeeds: string[]
    preferredFormats: string[]
  }
  goals: {
    business: string[]
    user: string[]
    metrics: string[]
  }
  contentTypes: ContentType[]
  governance: {
    workflow: string
    approvalProcess: string
    updateSchedule: string
    qualityStandards: string[]
  }
}

interface ContentType {
  name: string
  purpose: string
  format: string
  channels: string[]
  frequency: string
  owner: string
  approver: string
  metrics: string[]
}

// Example content strategy
const contentStrategy: ContentStrategy = {
  brand: {
    voice: 'Professional yet approachable',
    tone: ['helpful', 'clear', 'confident', 'empathetic'],
    personality: ['knowledgeable', 'reliable', 'innovative'],
    values: ['transparency', 'user-centricity', 'excellence'],
  },
  audience: {
    primaryAudience: [productManagerPersona, developerPersona],
    secondaryAudience: [executivePersona, designerPersona],
    contentNeeds: ['how-to guides', 'best practices', 'feature updates'],
    preferredFormats: ['articles', 'videos', 'interactive demos'],
  },
  goals: {
    business: ['increase user engagement', 'reduce support tickets', 'improve onboarding'],
    user: ['learn efficiently', 'solve problems quickly', 'stay updated'],
    metrics: ['time on page', 'completion rate', 'user satisfaction'],
  },
  contentTypes: [
    {
      name: 'Feature Documentation',
      purpose: 'Help users understand and use product features',
      format: 'Structured articles with examples',
      channels: ['knowledge base', 'in-app help'],
      frequency: 'As needed with feature releases',
      owner: 'Product team',
      approver: 'Technical writer',
      metrics: ['page views', 'user feedback', 'support ticket reduction'],
    },
  ],
  governance: {
    workflow: 'Draft → Review → Approve → Publish → Monitor',
    approvalProcess: 'Technical writer approval required for all content',
    updateSchedule: 'Quarterly content audit and updates',
    qualityStandards: ['accuracy', 'clarity', 'accessibility', 'brand consistency'],
  },
}
```

### Content Audit and Planning

**Content Audit Framework**:

```typescript
interface ContentAudit {
  contentInventory: ContentItem[]
  gapAnalysis: ContentGap[]
  recommendations: ContentRecommendation[]
  prioritization: ContentPriority[]
}

interface ContentItem {
  id: string
  title: string
  type: string
  url: string
  lastUpdated: string
  owner: string
  performance: {
    pageViews: number
    engagement: number
    userFeedback: number
  }
  quality: {
    accuracy: 'high' | 'medium' | 'low'
    relevance: 'high' | 'medium' | 'low'
    usability: 'high' | 'medium' | 'low'
  }
  status: 'keep' | 'update' | 'consolidate' | 'remove'
}

interface ContentGap {
  topic: string
  audience: string
  priority: 'high' | 'medium' | 'low'
  rationale: string
  suggestedFormat: string
}
```

## 🗂️ Information Architecture

### Navigation Design Principles

**Navigation Hierarchy**:

```typescript
interface NavigationStructure {
  primary: NavigationItem[]
  secondary: NavigationItem[]
  utility: NavigationItem[]
  footer: NavigationItem[]
}

interface NavigationItem {
  label: string
  href: string
  description?: string
  children?: NavigationItem[]
  audience?: string[]
  priority: number
}

// Example navigation structure
const navigationStructure: NavigationStructure = {
  primary: [
    {
      label: 'Getting Started',
      href: '/getting-started',
      description: 'Essential first steps and setup',
      priority: 1,
      children: [
        { label: 'Quick Start', href: '/getting-started/quick-start', priority: 1 },
        { label: 'Installation', href: '/getting-started/installation', priority: 2 },
        { label: 'Configuration', href: '/getting-started/configuration', priority: 3 },
      ],
    },
    {
      label: 'Features',
      href: '/features',
      description: 'Product capabilities and use cases',
      priority: 2,
      children: [
        { label: 'Dashboard', href: '/features/dashboard', priority: 1 },
        { label: 'Analytics', href: '/features/analytics', priority: 2 },
        { label: 'Integrations', href: '/features/integrations', priority: 3 },
      ],
    },
  ],
  secondary: [
    { label: 'API Reference', href: '/api', priority: 1 },
    { label: 'Tutorials', href: '/tutorials', priority: 2 },
    { label: 'Examples', href: '/examples', priority: 3 },
  ],
  utility: [
    { label: 'Support', href: '/support', priority: 1 },
    { label: 'Community', href: '/community', priority: 2 },
    { label: 'Status', href: '/status', priority: 3 },
  ],
  footer: [
    { label: 'Privacy Policy', href: '/privacy', priority: 1 },
    { label: 'Terms of Service', href: '/terms', priority: 2 },
    { label: 'Contact', href: '/contact', priority: 3 },
  ],
}
```

### Content Taxonomy

**Content Classification System**:

```typescript
interface ContentTaxonomy {
  categories: Category[]
  tags: Tag[]
  audiences: Audience[]
  formats: Format[]
}

interface Category {
  name: string
  description: string
  parent?: string
  icon: string
  color: string
}

interface Tag {
  name: string
  description: string
  category: string
  usage: number
}

// Example taxonomy
const contentTaxonomy: ContentTaxonomy = {
  categories: [
    {
      name: 'Getting Started',
      description: 'Initial setup and onboarding content',
      icon: 'rocket',
      color: 'green',
    },
    {
      name: 'Features',
      description: 'Product functionality and capabilities',
      icon: 'feature',
      color: 'blue',
    },
    {
      name: 'Troubleshooting',
      description: 'Problem-solving and error resolution',
      icon: 'wrench',
      color: 'orange',
    },
  ],
  tags: [
    {
      name: 'beginner',
      description: 'Content for new users',
      category: 'Getting Started',
      usage: 45,
    },
    {
      name: 'advanced',
      description: 'Content for experienced users',
      category: 'Features',
      usage: 23,
    },
    { name: 'api', description: 'API-related content', category: 'Features', usage: 67 },
  ],
  audiences: [
    { name: 'developers', description: 'Technical implementation audience' },
    { name: 'product-managers', description: 'Product strategy and planning audience' },
    { name: 'designers', description: 'Design and user experience audience' },
  ],
  formats: [
    { name: 'tutorial', description: 'Step-by-step instructional content' },
    { name: 'reference', description: 'Detailed technical documentation' },
    { name: 'guide', description: 'Comprehensive explanatory content' },
  ],
}
```

## ✍️ Writing Guidelines

### Voice and Tone Framework

**Brand Voice Definition**:

```typescript
interface BrandVoice {
  characteristics: VoiceCharacteristic[]
  toneVariations: ToneVariation[]
  writingPrinciples: string[]
  examples: VoiceExample[]
}

interface VoiceCharacteristic {
  trait: string
  description: string
  doExample: string
  dontExample: string
}

interface ToneVariation {
  context: string
  tone: string
  description: string
  example: string
}

// Example brand voice
const brandVoice: BrandVoice = {
  characteristics: [
    {
      trait: 'Clear',
      description: "We use simple, direct language that's easy to understand",
      doExample: 'Click the blue button to save your changes',
      dontExample: 'Utilize the azure-colored interactive element to persist your modifications',
    },
    {
      trait: 'Helpful',
      description: 'We anticipate user needs and provide actionable guidance',
      doExample: 'Need help? Check our setup guide or contact support',
      dontExample: 'Figure it out yourself or read the documentation',
    },
    {
      trait: 'Confident',
      description: "We're sure of our recommendations and speak with authority",
      doExample: 'This approach will solve your problem',
      dontExample: 'This might possibly help, maybe',
    },
  ],
  toneVariations: [
    {
      context: 'Error messages',
      tone: 'Empathetic and solution-focused',
      description: 'Acknowledge frustration and provide clear next steps',
      example:
        'Something went wrong with your upload. Try refreshing the page, or contact support if the problem continues.',
    },
    {
      context: 'Success messages',
      tone: 'Encouraging and clear',
      description: 'Celebrate user success while providing next steps',
      example: 'Great! Your project is now live. Share it with your team or continue editing.',
    },
  ],
  writingPrinciples: [
    'Lead with the most important information',
    'Use active voice whenever possible',
    'Write for scanability with headers and bullets',
    'Test content with real users',
  ],
  examples: [],
}
```

### Content Templates

**Article Template Structure**:

```markdown
# Article Title Template

## Overview

Brief summary of what this article covers and who it's for.

## Prerequisites

- What users need to know or have before starting
- Required access levels or setup
- Links to foundational content

## Step-by-Step Instructions

### Step 1: [Action Title]

Clear, actionable instruction with:

- **What to do**: Specific action
- **Where to find it**: Location in interface
- **Expected result**: What should happen

[Screenshot or diagram if helpful]

### Step 2: [Next Action]

Continue with logical progression...

## Troubleshooting

### Common Issues

| Problem           | Cause          | Solution      |
| ----------------- | -------------- | ------------- |
| Issue description | Why it happens | How to fix it |

### Still Need Help?

- Link to related articles
- Contact information for support
- Community resources

## Next Steps

- What to do after completing this task
- Related features to explore
- Advanced topics to learn

---

_Last updated: [Date] | Feedback: [Link to feedback form]_
```

### Microcopy Guidelines

**Interface Text Standards**:

```typescript
interface MicrocopyGuidelines {
  buttons: ButtonText[]
  formLabels: FormText[]
  errorMessages: ErrorText[]
  notifications: NotificationText[]
}

interface ButtonText {
  context: string
  preferred: string
  avoid: string
  reasoning: string
}

// Example microcopy guidelines
const microcopyGuidelines: MicrocopyGuidelines = {
  buttons: [
    {
      context: 'Primary action submission',
      preferred: 'Save changes',
      avoid: 'Submit',
      reasoning: 'Specific actions are clearer than generic terms',
    },
    {
      context: 'Destructive actions',
      preferred: 'Delete project',
      avoid: 'OK',
      reasoning: 'Users should understand the consequence of their action',
    },
  ],
  formLabels: [
    {
      context: 'Required fields',
      preferred: 'Email address *',
      avoid: 'Email (required)',
      reasoning: 'Asterisk is more scannable than parenthetical text',
    },
  ],
  errorMessages: [
    {
      context: 'Validation errors',
      preferred: 'Please enter a valid email address',
      avoid: 'Invalid input',
      reasoning: 'Specific guidance helps users fix the problem',
    },
  ],
  notifications: [
    {
      context: 'Success feedback',
      preferred: 'Your profile has been updated',
      avoid: 'Success!',
      reasoning: 'Specific confirmation builds confidence',
    },
  ],
}
```

## 🌍 Content Accessibility

### Accessible Writing Principles

**Inclusive Content Guidelines**:

```typescript
interface AccessibilityGuidelines {
  readability: ReadabilityStandard[]
  language: LanguageGuideline[]
  structure: StructureGuideline[]
  multimedia: MultimediaGuideline[]
}

interface ReadabilityStandard {
  principle: string
  guideline: string
  example: string
}

// Example accessibility guidelines
const accessibilityGuidelines: AccessibilityGuidelines = {
  readability: [
    {
      principle: 'Use simple language',
      guideline: 'Aim for 8th-grade reading level for general content',
      example: 'Click Save instead of Utilize the preservation functionality',
    },
    {
      principle: 'Keep sentences short',
      guideline: 'Maximum 20 words per sentence for complex instructions',
      example: 'First, open the menu. Then, select Settings.',
    },
  ],
  language: [
    {
      principle: 'Avoid jargon',
      guideline: 'Define technical terms on first use',
      example: 'API (Application Programming Interface) allows...',
    },
    {
      principle: 'Use inclusive language',
      guideline: 'Avoid gendered pronouns when referring to users',
      example: 'When a user logs in, they will see... (not he/she will see)',
    },
  ],
  structure: [
    {
      principle: 'Use descriptive headings',
      guideline: 'Headings should clearly describe the content that follows',
      example: 'How to Reset Your Password (not Password Issues)',
    },
    {
      principle: 'Provide clear link text',
      guideline: 'Link text should describe the destination',
      example: 'Read our Privacy Policy (not click here)',
    },
  ],
  multimedia: [
    {
      principle: 'Provide alt text',
      guideline: 'Describe the function and content of images',
      example: 'Screenshot of the Save button in the top-right corner',
    },
    {
      principle: 'Include captions',
      guideline: 'All videos should have accurate captions',
      example: 'Auto-generated captions reviewed and corrected for accuracy',
    },
  ],
}
```

### Internationalization Strategy

**Multi-language Content Planning**:

```typescript
interface InternationalizationStrategy {
  languages: LanguageSupport[]
  contentTypes: ContentLocalization[]
  workflow: LocalizationWorkflow
  guidelines: LocalizationGuideline[]
}

interface LanguageSupport {
  locale: string
  language: string
  region: string
  priority: 'primary' | 'secondary' | 'tertiary'
  completeness: number // percentage
  maintainer: string
}

// Example i18n strategy
const i18nStrategy: InternationalizationStrategy = {
  languages: [
    {
      locale: 'en-US',
      language: 'English',
      region: 'United States',
      priority: 'primary',
      completeness: 100,
      maintainer: 'Content team',
    },
    {
      locale: 'es-ES',
      language: 'Spanish',
      region: 'Spain',
      priority: 'secondary',
      completeness: 85,
      maintainer: 'Spanish localization team',
    },
  ],
  contentTypes: [
    {
      type: 'User interface',
      localizationRequired: true,
      updateFrequency: 'With each release',
      translationMemory: true,
    },
    {
      type: 'Help documentation',
      localizationRequired: true,
      updateFrequency: 'Quarterly',
      translationMemory: true,
    },
  ],
  workflow: {
    steps: ['Source content creation', 'Translation', 'Review', 'Publishing', 'Maintenance'],
    tools: ['Translation management system', 'CAT tools', 'Quality assurance tools'],
    timeline: '2-4 weeks per language for major updates',
  },
  guidelines: [
    {
      principle: 'Cultural adaptation',
      guideline: 'Adapt content for cultural context, not just language',
      example: 'Use appropriate date formats, currency, and cultural references',
    },
  ],
}
```

## 🔗 Related Practices

- **[Interface Design](interface-design.md)** - Content integration in user interfaces
- **[User Research](user-research.md)** - Content testing and optimization
- **[Design Systems](design-systems.md)** - Content components and patterns
- **[Quality/Accessibility](../quality/accessibility.md)** - Accessible content implementation

---

_Focus on clear communication, effective information architecture, and inclusive content design._
