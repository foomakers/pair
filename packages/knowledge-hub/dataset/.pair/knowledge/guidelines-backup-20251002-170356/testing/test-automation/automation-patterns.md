# 🔄 Automation Patterns

**Focus**: Common automation design patterns, best practices, and reusable automation solutions

Guidelines for implementing proven automation patterns that improve maintainability, reduce duplication, and enable scalable test automation across different testing scenarios.

## 🎯 Automation Pattern System

### Pattern Implementation Framework

````typescript
// ✅ Automation patterns and design system
class AutomationPatternManager {
  private patternRegistry: PatternRegistry
  private templateEngine: TemplateEngine
  private patternAnalyzer: PatternAnalyzer
  private implementationGenerator: ImplementationGenerator

  constructor() {
    this.patternRegistry = new PatternRegistry()
    this.templateEngine = new TemplateEngine()
    this.patternAnalyzer = new PatternAnalyzer()
    this.implementationGenerator = new ImplementationGenerator()
  }

  /**
   * Apply automation pattern to test scenario
   *
   * @example
   * ```typescript
   * const patternManager = new AutomationPatternManager();
   *
   * const implementation = await patternManager.applyPattern('page-object', {
   *   targetPage: 'LoginPage',
   *   elements: ['emailInput', 'passwordInput', 'submitButton'],
   *   actions: ['login', 'validateError'],
   *   framework: 'playwright'
   * });
   * ```
   */
  async applyPattern(patternName: string, context: PatternContext): Promise<PatternImplementation> {
    try {
      // Get pattern definition
      const pattern = await this.patternRegistry.getPattern(patternName)

      // Analyze context compatibility
      const compatibility = await this.patternAnalyzer.analyzeCompatibility(pattern, context)

      // Generate implementation
      const implementation = await this.implementationGenerator.generate(
        pattern,
        context,
        compatibility,
      )

      // Validate implementation
      const validation = await this.validateImplementation(implementation, pattern)

      return {
        pattern: pattern.name,
        context,
        implementation,
        validation,
        metadata: {
          generatedAt: new Date(),
          version: pattern.version,
          compatibility: compatibility.score,
        },
      }
    } catch (error) {
      throw new AutomationPatternError(`Failed to apply pattern ${patternName}: ${error.message}`, {
        patternName,
        context,
        error,
      })
    }
  }
}

/**
 * Page Object Pattern Implementation
 */

export class PageObjectPattern {
  /**
   * Generate page object class with standard methods
   */
  static generatePageObject(config: PageObjectConfig): string {
    return `
// Auto-generated Page Object for ${config.pageName}
export class ${config.pageName}Page {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }
  
  // Locators
  ${config.elements
    .map(
      element => `
  get ${element.name}() {
    return this.page.locator('${element.selector}');
  }`,
    )
    .join('')}
  
  // Navigation
  async navigate(url?: string): Promise<void> {
    const targetUrl = url || '${config.baseUrl}${config.path}';
    await this.page.goto(targetUrl);
    await this.waitForPageLoad();
  }
  
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    ${config.waitForElement ? `await this.${config.waitForElement}.waitFor();` : ''}
  }
  
  // Actions
  ${config.actions.map(action => this.generateActionMethod(action)).join('\n  ')}
  
  // Assertions
  async isDisplayed(): Promise<boolean> {
    try {
      ${
        config.identifierElement
          ? `await this.${config.identifierElement}.waitFor({ timeout: 5000 });`
          : ''
      }
      return true;
    } catch {
      return false;
    }
  }
  
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
  
  async getUrl(): Promise<string> {
    return this.page.url();
  }
}`
  }

  private static generateActionMethod(action: ActionConfig): string {
    switch (action.type) {
      case 'click':
        return `
  async ${action.name}(): Promise<void> {
    await this.${action.element}.click();
    ${action.waitAfter ? `await this.page.waitForTimeout(${action.waitAfter});` : ''}
  }`

      case 'fill':
        return `
  async ${action.name}(value: string): Promise<void> {
    await this.${action.element}.fill(value);
    ${action.waitAfter ? `await this.page.waitForTimeout(${action.waitAfter});` : ''}
  }`

      case 'select':
        return `
  async ${action.name}(value: string): Promise<void> {
    await this.${action.element}.selectOption(value);
    ${action.waitAfter ? `await this.page.waitForTimeout(${action.waitAfter});` : ''}
  }`

      default:
        return `
  async ${action.name}(): Promise<void> {
    // Custom action implementation
    throw new Error('Custom action not implemented: ${action.name}');
  }`
    }
  }
}

/**
 * Builder Pattern for Test Data
 */

export class TestDataBuilderPattern {
  /**
   * Generate builder class for test data creation
   */
  static generateBuilder(config: BuilderConfig): string {
    return `
// Auto-generated Builder for ${config.entityName}
export class ${config.entityName}Builder {
  private data: Partial<${config.entityName}> = {};
  
  constructor() {
    // Set default values
    ${config.fields
      .map(field => {
        if (field.defaultValue !== undefined) {
          return `this.data.${field.name} = ${JSON.stringify(field.defaultValue)};`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n    ')}
  }
  
  // Builder methods
  ${config.fields
    .map(
      field => `
  with${this.capitalize(field.name)}(value: ${field.type}): ${config.entityName}Builder {
    this.data.${field.name} = value;
    return this;
  }`,
    )
    .join('')}
  
  // Preset methods
  ${
    config.presets
      ?.map(
        preset => `
  ${preset.name}(): ${config.entityName}Builder {
    ${Object.entries(preset.values)
      .map(([key, value]) => `this.data.${key} = ${JSON.stringify(value)};`)
      .join('\n    ')}
    return this;
  }`,
      )
      .join('') || ''
  }
  
  // Build method
  build(): ${config.entityName} {
    ${
      config.requiredFields
        ?.map(
          field => `
    if (this.data.${field} === undefined) {
      throw new Error('Required field missing: ${field}');
    }`,
        )
        .join('') || ''
    }
    
    return {
      ${config.fields.map(field => `${field.name}: this.data.${field.name}`).join(',\n      ')}
    } as ${config.entityName};
  }
  
  // Array builder
  buildArray(count: number): ${config.entityName}[] {
    return Array.from({ length: count }, (_, index) => {
      const builder = new ${config.entityName}Builder();
      Object.assign(builder.data, this.data);
      ${
        config.uniqueFields
          ?.map(
            field => `
      if (this.data.${field} !== undefined) {
        builder.data.${field} = \`\${this.data.${field}}_\${index}\`;
      }`,
          )
          .join('') || ''
      }
      return builder.build();
    });
  }
}`
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}

/**
 * Factory Pattern for Test Objects
 */

export class TestFactoryPattern {
  /**
   * Generate factory class for creating test objects
   */
  static generateFactory(config: FactoryConfig): string {
    return `
// Auto-generated Factory for ${config.entityName}
export class ${config.entityName}Factory {
  private static sequenceCounters: Map<string, number> = new Map();
  
  private static getNextSequence(field: string): number {
    const current = this.sequenceCounters.get(field) || 0;
    const next = current + 1;
    this.sequenceCounters.set(field, next);
    return next;
  }
  
  // Basic create method
  static create(overrides: Partial<${config.entityName}> = {}): ${config.entityName} {
    const defaults = this.createDefaults();
    return { ...defaults, ...overrides };
  }
  
  // Create array method
  static createArray(count: number, overrides: Partial<${config.entityName}> = {}): ${
      config.entityName
    }[] {
    return Array.from({ length: count }, (_, index) => {
      const indexedOverrides = { ...overrides };
      ${
        config.sequenceFields
          ?.map(
            field => `
      if (overrides.${field} === undefined) {
        indexedOverrides.${field} = \`\${this.createDefaults().${field}}_\${index}\`;
      }`,
          )
          .join('') || ''
      }
      return this.create(indexedOverrides);
    });
  }
  
  // Trait methods
  ${
    config.traits
      ?.map(
        trait => `
  static ${trait.name}(overrides: Partial<${config.entityName}> = {}): ${config.entityName} {
    const traitDefaults = {
      ${Object.entries(trait.attributes)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(',\n      ')}
    };
    return this.create({ ...traitDefaults, ...overrides });
  }`,
      )
      .join('\n  ') || ''
  }
  
  // Default values generator
  private static createDefaults(): ${config.entityName} {
    return {
      ${config.fields
        .map(field => {
          if (field.generator) {
            return `${field.name}: ${field.generator}`
          } else if (field.sequence) {
            return `${field.name}: \`${field.pattern}\${this.getNextSequence('${field.name}')}\``
          } else {
            return `${field.name}: ${JSON.stringify(field.defaultValue)}`
          }
        })
        .join(',\n      ')}
    };
  }
  
  // Reset sequences (useful for test isolation)
  static resetSequences(): void {
    this.sequenceCounters.clear();
  }
}`
  }
}

/**
 * Command Pattern for Test Actions
 */

export class CommandPattern {
  /**
   * Generate command pattern implementation
   */
  static generateCommand(config: CommandConfig): string {
    return `
// Command interface
interface TestCommand {
  execute(): Promise<void>;
  undo?(): Promise<void>;
  canUndo?(): boolean;
}

// Auto-generated Commands for ${config.contextName}
${config.commands
  .map(
    cmd => `
export class ${cmd.name}Command implements TestCommand {
  ${cmd.parameters?.map(param => `private ${param.name}: ${param.type};`).join('\n  ') || ''}
  
  constructor(${cmd.parameters?.map(param => `${param.name}: ${param.type}`).join(', ') || ''}) {
    ${cmd.parameters?.map(param => `this.${param.name} = ${param.name};`).join('\n    ') || ''}
  }
  
  async execute(): Promise<void> {
    ${cmd.implementation || '// Implementation placeholder'}
  }
  
  ${
    cmd.undoable
      ? `
  async undo(): Promise<void> {
    ${cmd.undoImplementation || '// Undo implementation placeholder'}
  }
  
  canUndo(): boolean {
    return true;
  }`
      : ''
  }
}
`,
  )
  .join('')}

// Command executor with history
export class TestCommandExecutor {
  private history: TestCommand[] = [];
  private currentIndex: number = -1;
  
  async execute(command: TestCommand): Promise<void> {
    await command.execute();
    
    // Add to history
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(command);
    this.currentIndex++;
  }
  
  async undo(): Promise<void> {
    if (this.currentIndex >= 0) {
      const command = this.history[this.currentIndex];
      if (command.undo && command.canUndo?.()) {
        await command.undo();
        this.currentIndex--;
      }
    }
  }
  
  async undoAll(): Promise<void> {
    while (this.currentIndex >= 0) {
      await this.undo();
    }
  }
  
  clearHistory(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}`
  }
}

/**
 * Strategy Pattern for Test Execution
 */

export class StrategyPattern {
  /**
   * Generate strategy pattern for different test execution approaches
   */
  static generateStrategy(config: StrategyConfig): string {
    return `
// Strategy interface
interface ${config.strategyName}Strategy {
  execute(context: ${config.contextType}): Promise<${config.returnType}>;
  getName(): string;
  isApplicable(context: ${config.contextType}): boolean;
}

// Auto-generated Strategies
${config.strategies
  .map(
    strategy => `
export class ${strategy.name}Strategy implements ${config.strategyName}Strategy {
  getName(): string {
    return '${strategy.name}';
  }
  
  isApplicable(context: ${config.contextType}): boolean {
    ${strategy.applicabilityCheck || 'return true;'}
  }
  
  async execute(context: ${config.contextType}): Promise<${config.returnType}> {
    ${strategy.implementation || '// Implementation placeholder'}
  }
}
`,
  )
  .join('')}

// Strategy context
export class ${config.strategyName}Context {
  private strategy: ${config.strategyName}Strategy;
  
  constructor(strategy: ${config.strategyName}Strategy) {
    this.strategy = strategy;
  }
  
  setStrategy(strategy: ${config.strategyName}Strategy): void {
    this.strategy = strategy;
  }
  
  async execute(context: ${config.contextType}): Promise<${config.returnType}> {
    if (!this.strategy.isApplicable(context)) {
      throw new Error(\`Strategy \${this.strategy.getName()} is not applicable to current context\`);
    }
    return await this.strategy.execute(context);
  }
}

// Strategy factory
export class ${config.strategyName}Factory {
  private static strategies: Map<string, ${config.strategyName}Strategy> = new Map([
    ${config.strategies
      .map(strategy => `['${strategy.name}', new ${strategy.name}Strategy()]`)
      .join(',\n    ')}
  ]);
  
  static getStrategy(name: string): ${config.strategyName}Strategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(\`Strategy not found: \${name}\`);
    }
    return strategy;
  }
  
  static getApplicableStrategies(context: ${config.contextType}): ${config.strategyName}Strategy[] {
    return Array.from(this.strategies.values())
      .filter(strategy => strategy.isApplicable(context));
  }
  
  static getBestStrategy(context: ${config.contextType}): ${config.strategyName}Strategy {
    const applicable = this.getApplicableStrategies(context);
    if (applicable.length === 0) {
      throw new Error('No applicable strategy found for context');
    }
    return applicable[0]; // Return first applicable, or implement scoring logic
  }
}`
  }
}

/**
 * Observer Pattern for Test Events
 */

export class ObserverPattern {
  /**
   * Generate observer pattern for test event handling
   */
  static generateObserver(config: ObserverConfig): string {
    return `
// Event types
${config.events
  .map(
    event => `
export interface ${event.name}Event {
  type: '${event.type}';
  timestamp: Date;
  ${event.data?.map(field => `${field.name}: ${field.type};`).join('\n  ') || ''}
}
`,
  )
  .join('')}

// Union type for all events
export type TestEvent = ${config.events.map(event => `${event.name}Event`).join(' | ')};

// Observer interface
export interface TestEventObserver {
  onEvent(event: TestEvent): Promise<void>;
  getEventTypes(): string[];
}

// Auto-generated Observers
${config.observers
  .map(
    observer => `
export class ${observer.name}Observer implements TestEventObserver {
  getEventTypes(): string[] {
    return [${observer.eventTypes.map(type => `'${type}'`).join(', ')}];
  }
  
  async onEvent(event: TestEvent): Promise<void> {
    switch (event.type) {
      ${observer.eventTypes
        .map(
          type => `
      case '${type}':
        await this.handle${this.capitalize(type)}Event(event as ${this.getEventClass(
            type,
            config.events,
          )}Event);
        break;`,
        )
        .join('')}
      default:
        // Ignore unknown events
        break;
    }
  }
  
  ${observer.eventTypes
    .map(
      type => `
  private async handle${this.capitalize(type)}Event(event: ${this.getEventClass(
        type,
        config.events,
      )}Event): Promise<void> {
    ${observer.implementations?.[type] || '// Implementation placeholder'}
  }`,
    )
    .join('')}
}
`,
  )
  .join('')}

// Event dispatcher
export class TestEventDispatcher {
  private observers: TestEventObserver[] = [];
  private eventHistory: TestEvent[] = [];
  
  addObserver(observer: TestEventObserver): void {
    this.observers.push(observer);
  }
  
  removeObserver(observer: TestEventObserver): void {
    const index = this.observers.indexOf(observer);
    if (index >= 0) {
      this.observers.splice(index, 1);
    }
  }
  
  async dispatch(event: TestEvent): Promise<void> {
    this.eventHistory.push(event);
    
    const promises = this.observers
      .filter(observer => observer.getEventTypes().includes(event.type))
      .map(observer => observer.onEvent(event));
    
    await Promise.all(promises);
  }
  
  getEventHistory(): TestEvent[] {
    return [...this.eventHistory];
  }
  
  clearHistory(): void {
    this.eventHistory = [];
  }
}`
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  private static getEventClass(type: string, events: any[]): string {
    const event = events.find(e => e.type === type)
    return event ? event.name : 'Unknown'
  }
}

// Supporting interfaces and types
interface PatternContext {
  readonly targetPage?: string
  readonly elements?: ElementConfig[]
  readonly actions?: ActionConfig[]
  readonly framework?: string
  readonly entityName?: string
  readonly fields?: FieldConfig[]
  [key: string]: any
}

interface ElementConfig {
  readonly name: string
  readonly selector: string
  readonly type: 'input' | 'button' | 'link' | 'text' | 'select'
}

interface ActionConfig {
  readonly name: string
  readonly type: 'click' | 'fill' | 'select' | 'custom'
  readonly element: string
  readonly waitAfter?: number
}

interface FieldConfig {
  readonly name: string
  readonly type: string
  readonly defaultValue?: any
  readonly generator?: string
  readonly sequence?: boolean
  readonly pattern?: string
}

interface PageObjectConfig {
  readonly pageName: string
  readonly baseUrl: string
  readonly path: string
  readonly elements: ElementConfig[]
  readonly actions: ActionConfig[]
  readonly waitForElement?: string
  readonly identifierElement?: string
}

interface BuilderConfig {
  readonly entityName: string
  readonly fields: FieldConfig[]
  readonly requiredFields?: string[]
  readonly uniqueFields?: string[]
  readonly presets?: PresetConfig[]
}

interface PresetConfig {
  readonly name: string
  readonly values: { [key: string]: any }
}

interface FactoryConfig {
  readonly entityName: string
  readonly fields: FieldConfig[]
  readonly sequenceFields?: string[]
  readonly traits?: TraitConfig[]
}

interface TraitConfig {
  readonly name: string
  readonly attributes: { [key: string]: any }
}

interface CommandConfig {
  readonly contextName: string
  readonly commands: CommandDefinition[]
}

interface CommandDefinition {
  readonly name: string
  readonly parameters?: ParameterConfig[]
  readonly implementation?: string
  readonly undoable?: boolean
  readonly undoImplementation?: string
}

interface ParameterConfig {
  readonly name: string
  readonly type: string
}

interface StrategyConfig {
  readonly strategyName: string
  readonly contextType: string
  readonly returnType: string
  readonly strategies: StrategyDefinition[]
}

interface StrategyDefinition {
  readonly name: string
  readonly implementation?: string
  readonly applicabilityCheck?: string
}

interface ObserverConfig {
  readonly events: EventDefinition[]
  readonly observers: ObserverDefinition[]
}

interface EventDefinition {
  readonly name: string
  readonly type: string
  readonly data?: FieldConfig[]
}

interface ObserverDefinition {
  readonly name: string
  readonly eventTypes: string[]
  readonly implementations?: { [eventType: string]: string }
}

interface PatternImplementation {
  readonly pattern: string
  readonly context: PatternContext
  readonly implementation: any
  readonly validation: any
  readonly metadata: any
}

// Placeholder interfaces for external dependencies
interface PatternRegistry {
  getPattern(name: string): Promise<any>
}

interface TemplateEngine {
  // Template processing interface
}

interface PatternAnalyzer {
  analyzeCompatibility(pattern: any, context: PatternContext): Promise<any>
}

interface ImplementationGenerator {
  generate(pattern: any, context: PatternContext, compatibility: any): Promise<any>
}

class AutomationPatternError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'AutomationPatternError'
  }
}
````

## 🔗 Related Concepts

- **[Automation Framework](automation-framework.md)** - Framework architecture for patterns
- **[Test Execution](test-execution.md)** - Execution patterns and strategies
- **[CI/CD Integration](ci-cd-integration.md)** - Integration patterns for CI/CD
- **[Page Object Model](.pair/knowledge/guidelines/testing/testing-implementation/e2e-testing.md)** - Page Object implementation patterns

## 🎯 Implementation Guidelines

1. **Pattern Selection**: Choose appropriate patterns based on test requirements
2. **Consistency**: Apply patterns consistently across the test suite
3. **Maintainability**: Design patterns for easy maintenance and updates
4. **Reusability**: Create reusable pattern implementations
5. **Documentation**: Document pattern usage and guidelines
6. **Testing**: Test pattern implementations themselves
7. **Evolution**: Allow patterns to evolve with changing requirements
8. **Training**: Ensure team understanding of implemented patterns

## 📏 Benefits

- **Consistency**: Standardized approaches across test automation
- **Maintainability**: Easier maintenance through proven design patterns
- **Reusability**: Reduced duplication through reusable components
- **Scalability**: Patterns support scaling of automation efforts
- **Quality**: Proven patterns improve overall automation quality
- **Productivity**: Faster development through established patterns
- **Knowledge Sharing**: Patterns facilitate knowledge transfer within teams

---

_Automation Patterns provide proven, reusable solutions for common automation challenges, improving consistency, maintainability, and effectiveness of test automation implementations._
