# 🔄 TDD Approach

**Focus**: Test-Driven Development methodology, practices, and implementation strategies

Guidelines for implementing effective Test-Driven Development that improves code quality, design, and maintainability through the Red-Green-Refactor cycle and comprehensive testing practices.

## 🎯 TDD Principles

### TDD Cycle Implementation

````typescript
// ✅ TDD cycle framework and workflow
class TDDCycle {
  private currentPhase: TDDPhase = 'red'
  private testSuite: TestSuite
  private codebase: Codebase
  private metrics: TDDMetrics

  constructor(testSuite: TestSuite, codebase: Codebase) {
    this.testSuite = testSuite
    this.codebase = codebase
    this.metrics = new TDDMetrics()
  }

  /**
   * Execute complete TDD cycle for a feature
   *
   * @example
   * ```typescript
   * const tddCycle = new TDDCycle(testSuite, codebase);
   *
   * await tddCycle.implementFeature({
   *   name: 'user-authentication',
   *   requirements: authRequirements,
   *   acceptanceCriteria: authCriteria
   * });
   * ```
   */
  async implementFeature(feature: FeatureSpec): Promise<TDDResult> {
    const cycleStart = Date.now()
    const cycles: CycleExecution[] = []

    try {
      // Break down feature into testable units
      const testableUnits = await this.breakDownFeature(feature)

      for (const unit of testableUnits) {
        const cycleResult = await this.executeCycle(unit)
        cycles.push(cycleResult)

        // Validate cycle completion
        if (!cycleResult.success) {
          throw new TDDError(`Cycle failed for unit: ${unit.name}`, cycleResult)
        }
      }

      // Final integration and cleanup
      await this.integrateUnits(testableUnits)

      const totalDuration = Date.now() - cycleStart

      return {
        success: true,
        feature,
        cycles,
        metrics: this.metrics.getMetrics(),
        duration: totalDuration,
        codeQuality: await this.assessCodeQuality(),
        testQuality: await this.assessTestQuality(),
      }
    } catch (error) {
      return {
        success: false,
        feature,
        cycles,
        error: error.message,
        duration: Date.now() - cycleStart,
        metrics: this.metrics.getMetrics(),
      }
    }
  }

  /**
   * Execute single Red-Green-Refactor cycle
   */
  private async executeCycle(unit: TestableUnit): Promise<CycleExecution> {
    const cycleStart = Date.now()

    // RED: Write failing test
    const redResult = await this.redPhase(unit)
    if (!redResult.success) {
      return {
        unit,
        success: false,
        phase: 'red',
        error: redResult.error,
        duration: Date.now() - cycleStart,
      }
    }

    // GREEN: Make test pass with minimal code
    const greenResult = await this.greenPhase(unit)
    if (!greenResult.success) {
      return {
        unit,
        success: false,
        phase: 'green',
        error: greenResult.error,
        duration: Date.now() - cycleStart,
      }
    }

    // REFACTOR: Improve code quality
    const refactorResult = await this.refactorPhase(unit)
    if (!refactorResult.success) {
      return {
        unit,
        success: false,
        phase: 'refactor',
        error: refactorResult.error,
        duration: Date.now() - cycleStart,
      }
    }

    const duration = Date.now() - cycleStart
    this.metrics.recordCycle(duration, unit.complexity)

    return {
      unit,
      success: true,
      duration,
      redResult,
      greenResult,
      refactorResult,
    }
  }

  /**
   * RED PHASE: Write a failing test
   *
   * The test should:
   * - Be focused on one specific behavior
   * - Use clear, descriptive names
   * - Follow the arrange-act-assert pattern
   * - Fail for the right reason (not due to syntax errors)
   */
  private async redPhase(unit: TestableUnit): Promise<PhaseResult> {
    try {
      this.currentPhase = 'red'

      // Generate test specification
      const testSpec = await this.generateTestSpec(unit)

      // Write the test
      const test = await this.writeTest(testSpec)

      // Add test to suite
      await this.testSuite.addTest(test)

      // Run test to ensure it fails
      const testResult = await this.testSuite.runTest(test.id)

      if (testResult.status !== 'failed') {
        throw new TDDError('Test should fail in RED phase', testResult)
      }

      // Validate failure reason
      if (!this.isValidFailure(testResult.error)) {
        throw new TDDError('Test failed for wrong reason', testResult)
      }

      this.metrics.recordRedPhase(true)

      return {
        success: true,
        phase: 'red',
        test,
        testResult,
        message: 'Test written and failing correctly',
      }
    } catch (error) {
      this.metrics.recordRedPhase(false)
      return {
        success: false,
        phase: 'red',
        error: error.message,
      }
    }
  }

  /**
   * GREEN PHASE: Write minimal code to make test pass
   *
   * The implementation should:
   * - Make the test pass with minimal code
   * - Not worry about perfect design initially
   * - Focus on satisfying the test requirements
   * - Avoid over-engineering
   */
  private async greenPhase(unit: TestableUnit): Promise<PhaseResult> {
    try {
      this.currentPhase = 'green'

      // Implement minimal code to make test pass
      const implementation = await this.implementMinimalCode(unit)

      // Add implementation to codebase
      await this.codebase.addImplementation(implementation)

      // Run all tests to ensure they pass
      const testResults = await this.testSuite.runAllTests()

      if (!testResults.allPassed) {
        throw new TDDError('Tests should pass in GREEN phase', testResults)
      }

      this.metrics.recordGreenPhase(true, implementation.linesOfCode)

      return {
        success: true,
        phase: 'green',
        implementation,
        testResults,
        message: 'Implementation complete, all tests passing',
      }
    } catch (error) {
      this.metrics.recordGreenPhase(false)
      return {
        success: false,
        phase: 'green',
        error: error.message,
      }
    }
  }

  /**
   * REFACTOR PHASE: Improve code quality while keeping tests green
   *
   * The refactoring should:
   * - Improve code structure and readability
   * - Eliminate duplication
   * - Improve naming and design
   * - Keep all tests passing
   */
  private async refactorPhase(unit: TestableUnit): Promise<PhaseResult> {
    try {
      this.currentPhase = 'refactor'

      // Identify refactoring opportunities
      const opportunities = await this.identifyRefactoringOpportunities(unit)

      let refactoringApplied = false

      for (const opportunity of opportunities) {
        // Apply refactoring
        const refactoringResult = await this.applyRefactoring(opportunity)

        // Run tests to ensure they still pass
        const testResults = await this.testSuite.runAllTests()

        if (!testResults.allPassed) {
          // Revert refactoring
          await this.revertRefactoring(refactoringResult)
          continue
        }

        refactoringApplied = true
        this.metrics.recordRefactoring(opportunity.type, refactoringResult.impact)
      }

      this.metrics.recordRefactorPhase(true, opportunities.length)

      return {
        success: true,
        phase: 'refactor',
        opportunities,
        refactoringsApplied: opportunities.filter(o => o.applied),
        message: refactoringApplied ? 'Code refactored successfully' : 'No refactoring needed',
      }
    } catch (error) {
      this.metrics.recordRefactorPhase(false)
      return {
        success: false,
        phase: 'refactor',
        error: error.message,
      }
    }
  }

  // Helper methods for TDD cycle
  private async breakDownFeature(feature: FeatureSpec): Promise<TestableUnit[]> {
    const units: TestableUnit[] = []

    // Break down by acceptance criteria
    for (const criteria of feature.acceptanceCriteria) {
      const unit: TestableUnit = {
        id: `${feature.name}-${criteria.id}`,
        name: criteria.description,
        type: this.determineUnitType(criteria),
        complexity: this.assessComplexity(criteria),
        requirements: criteria.requirements,
        inputs: criteria.inputs || [],
        expectedOutputs: criteria.expectedOutputs || [],
        edgeCases: criteria.edgeCases || [],
        errorCases: criteria.errorCases || [],
      }

      units.push(unit)
    }

    return units
  }

  private async generateTestSpec(unit: TestableUnit): Promise<TestSpec> {
    return {
      id: `test-${unit.id}`,
      name: `should ${unit.name}`,
      description: `Test that verifies ${unit.name} behavior`,
      unitUnderTest: unit,
      testType: unit.type,
      arrange: await this.generateArrangeStep(unit),
      act: await this.generateActStep(unit),
      assert: await this.generateAssertStep(unit),
    }
  }

  private async writeTest(testSpec: TestSpec): Promise<Test> {
    const testCode = this.generateTestCode(testSpec)

    return {
      id: testSpec.id,
      name: testSpec.name,
      description: testSpec.description,
      code: testCode,
      framework: 'vitest',
      type: testSpec.testType,
      createdAt: new Date(),
    }
  }

  private generateTestCode(testSpec: TestSpec): string {
    return `
describe('${testSpec.unitUnderTest.name}', () => {
  test('${testSpec.name}', () => {
    // Arrange
    ${testSpec.arrange.code}
    
    // Act
    ${testSpec.act.code}
    
    // Assert
    ${testSpec.assert.code}
  });
});
    `.trim()
  }

  private isValidFailure(error: string): boolean {
    // Check if failure is due to missing implementation, not syntax error
    return (
      !error.includes('SyntaxError') &&
      !error.includes('ReferenceError') &&
      (error.includes('not implemented') ||
        error.includes('undefined') ||
        error.includes('not a function'))
    )
  }

  private async implementMinimalCode(unit: TestableUnit): Promise<Implementation> {
    // Generate minimal implementation that satisfies the test
    const implementation = await this.generateMinimalImplementation(unit)

    return {
      id: `impl-${unit.id}`,
      unitId: unit.id,
      code: implementation.code,
      linesOfCode: implementation.linesOfCode,
      complexity: 1, // Start with minimal complexity
      createdAt: new Date(),
    }
  }

  private async generateMinimalImplementation(
    unit: TestableUnit,
  ): Promise<{ code: string; linesOfCode: number }> {
    // This would generate minimal code based on the unit requirements
    // For demo purposes, returning a simple structure

    const functionName = this.extractFunctionName(unit.name)
    const parameters = unit.inputs.map(input => input.name).join(', ')
    const returnValue = this.determineReturnValue(unit.expectedOutputs)

    const code = `
export function ${functionName}(${parameters}) {
  // TODO: Implement ${unit.name}
  return ${returnValue};
}
    `.trim()

    return {
      code,
      linesOfCode: code.split('\n').length,
    }
  }

  private async identifyRefactoringOpportunities(
    unit: TestableUnit,
  ): Promise<RefactoringOpportunity[]> {
    const opportunities: RefactoringOpportunity[] = []

    // Check for code duplication
    const duplication = await this.detectDuplication(unit)
    if (duplication.length > 0) {
      opportunities.push({
        type: 'extract-method',
        description: 'Extract duplicated code into reusable method',
        priority: 'high',
        impact: 'medium',
        effort: 'low',
        applied: false,
      })
    }

    // Check for long methods
    const longMethods = await this.detectLongMethods(unit)
    if (longMethods.length > 0) {
      opportunities.push({
        type: 'break-down-method',
        description: 'Break down long method into smaller methods',
        priority: 'medium',
        impact: 'high',
        effort: 'medium',
        applied: false,
      })
    }

    // Check for magic numbers/strings
    const magicValues = await this.detectMagicValues(unit)
    if (magicValues.length > 0) {
      opportunities.push({
        type: 'extract-constant',
        description: 'Extract magic values into named constants',
        priority: 'low',
        impact: 'low',
        effort: 'low',
        applied: false,
      })
    }

    return opportunities
  }

  private async applyRefactoring(opportunity: RefactoringOpportunity): Promise<RefactoringResult> {
    // Apply the specific refactoring based on type
    const result: RefactoringResult = {
      opportunity,
      success: true,
      changes: [],
      impact: opportunity.impact,
      revertData: {}, // Store data needed to revert if tests fail
    }

    switch (opportunity.type) {
      case 'extract-method':
        result.changes = await this.extractMethod()
        break
      case 'break-down-method':
        result.changes = await this.breakDownMethod()
        break
      case 'extract-constant':
        result.changes = await this.extractConstant()
        break
      default:
        result.success = false
        result.error = `Unknown refactoring type: ${opportunity.type}`
    }

    opportunity.applied = result.success

    return result
  }

  private async revertRefactoring(refactoringResult: RefactoringResult): Promise<void> {
    // Revert changes if tests fail after refactoring
    for (const change of refactoringResult.changes.reverse()) {
      await this.revertChange(change)
    }
  }

  private async integrateUnits(units: TestableUnit[]): Promise<void> {
    // Run integration tests if needed
    await this.testSuite.runIntegrationTests()

    // Perform final code quality checks
    await this.performQualityChecks()
  }

  private async assessCodeQuality(): Promise<CodeQualityAssessment> {
    return {
      complexity: await this.calculateComplexity(),
      maintainability: await this.calculateMaintainability(),
      testability: await this.calculateTestability(),
      coverage: await this.calculateCoverage(),
      duplication: await this.calculateDuplication(),
    }
  }

  private async assessTestQuality(): Promise<TestQualityAssessment> {
    return {
      coverage: await this.calculateTestCoverage(),
      readability: await this.calculateTestReadability(),
      maintainability: await this.calculateTestMaintainability(),
      reliability: await this.calculateTestReliability(),
    }
  }

  // Utility methods
  private determineUnitType(criteria: AcceptanceCriteria): TestableUnitType {
    if (criteria.description.includes('validate') || criteria.description.includes('check')) {
      return 'validation'
    }
    if (criteria.description.includes('transform') || criteria.description.includes('convert')) {
      return 'transformation'
    }
    if (criteria.description.includes('calculate') || criteria.description.includes('compute')) {
      return 'calculation'
    }
    return 'behavior'
  }

  private assessComplexity(criteria: AcceptanceCriteria): ComplexityLevel {
    const factors = [
      criteria.inputs?.length || 0,
      criteria.expectedOutputs?.length || 0,
      criteria.edgeCases?.length || 0,
      criteria.errorCases?.length || 0,
    ]

    const totalComplexity = factors.reduce((sum, factor) => sum + factor, 0)

    if (totalComplexity <= 3) return 'low'
    if (totalComplexity <= 7) return 'medium'
    return 'high'
  }

  private async generateArrangeStep(unit: TestableUnit): Promise<TestStep> {
    return {
      description: 'Set up test data and dependencies',
      code: unit.inputs.map(input => `const ${input.name} = ${input.sampleValue};`).join('\n    '),
    }
  }

  private async generateActStep(unit: TestableUnit): Promise<TestStep> {
    const functionName = this.extractFunctionName(unit.name)
    const parameters = unit.inputs.map(input => input.name).join(', ')

    return {
      description: 'Execute the function under test',
      code: `const result = ${functionName}(${parameters});`,
    }
  }

  private async generateAssertStep(unit: TestableUnit): Promise<TestStep> {
    const assertions = unit.expectedOutputs
      .map(output => `expect(result.${output.name}).toBe(${output.expectedValue});`)
      .join('\n    ')

    return {
      description: 'Verify the expected outcome',
      code: assertions || 'expect(result).toBeDefined();',
    }
  }

  private extractFunctionName(description: string): string {
    // Extract function name from description
    return description.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')
  }

  private determineReturnValue(expectedOutputs: ExpectedOutput[]): string {
    if (expectedOutputs.length === 0) return 'undefined'
    if (expectedOutputs.length === 1) return expectedOutputs[0].expectedValue

    // Multiple outputs - return object
    const obj = expectedOutputs.map(output => `${output.name}: ${output.expectedValue}`).join(', ')
    return `{ ${obj} }`
  }

  private async detectDuplication(unit: TestableUnit): Promise<string[]> {
    // Implementation would detect code duplication
    return []
  }

  private async detectLongMethods(unit: TestableUnit): Promise<string[]> {
    // Implementation would detect long methods
    return []
  }

  private async detectMagicValues(unit: TestableUnit): Promise<string[]> {
    // Implementation would detect magic values
    return []
  }

  private async extractMethod(): Promise<CodeChange[]> {
    // Implementation would extract methods
    return []
  }

  private async breakDownMethod(): Promise<CodeChange[]> {
    // Implementation would break down methods
    return []
  }

  private async extractConstant(): Promise<CodeChange[]> {
    // Implementation would extract constants
    return []
  }

  private async revertChange(change: CodeChange): Promise<void> {
    // Implementation would revert a specific change
  }

  private async performQualityChecks(): Promise<void> {
    // Implementation would perform final quality checks
  }

  private async calculateComplexity(): Promise<number> {
    // Implementation would calculate code complexity
    return 0
  }

  private async calculateMaintainability(): Promise<number> {
    // Implementation would calculate maintainability score
    return 0
  }

  private async calculateTestability(): Promise<number> {
    // Implementation would calculate testability score
    return 0
  }

  private async calculateCoverage(): Promise<number> {
    // Implementation would calculate code coverage
    return 0
  }

  private async calculateDuplication(): Promise<number> {
    // Implementation would calculate code duplication
    return 0
  }

  private async calculateTestCoverage(): Promise<number> {
    // Implementation would calculate test coverage
    return 0
  }

  private async calculateTestReadability(): Promise<number> {
    // Implementation would calculate test readability
    return 0
  }

  private async calculateTestMaintainability(): Promise<number> {
    // Implementation would calculate test maintainability
    return 0
  }

  private async calculateTestReliability(): Promise<number> {
    // Implementation would calculate test reliability
    return 0
  }
}

// ✅ TDD metrics tracking
class TDDMetrics {
  private cycles: CycleMetrics[] = []
  private phases: PhaseMetrics = {
    red: { attempts: 0, successes: 0, avgDuration: 0 },
    green: { attempts: 0, successes: 0, avgDuration: 0, avgLinesOfCode: 0 },
    refactor: { attempts: 0, successes: 0, avgDuration: 0, refactoringsApplied: 0 },
  }

  recordCycle(duration: number, complexity: ComplexityLevel): void {
    this.cycles.push({
      duration,
      complexity,
      timestamp: new Date(),
    })
  }

  recordRedPhase(success: boolean, duration: number = 0): void {
    this.phases.red.attempts++
    if (success) this.phases.red.successes++
    this.updateAverageDuration('red', duration)
  }

  recordGreenPhase(success: boolean, linesOfCode: number = 0, duration: number = 0): void {
    this.phases.green.attempts++
    if (success) {
      this.phases.green.successes++
      this.updateAverageLinesOfCode(linesOfCode)
    }
    this.updateAverageDuration('green', duration)
  }

  recordRefactorPhase(success: boolean, refactoringsCount: number = 0, duration: number = 0): void {
    this.phases.refactor.attempts++
    if (success) {
      this.phases.refactor.successes++
      this.phases.refactor.refactoringsApplied += refactoringsCount
    }
    this.updateAverageDuration('refactor', duration)
  }

  recordRefactoring(type: string, impact: string): void {
    // Record specific refactoring metrics
  }

  getMetrics(): TDDMetricsReport {
    return {
      totalCycles: this.cycles.length,
      avgCycleDuration: this.calculateAverageCycleDuration(),
      successRate: this.calculateOverallSuccessRate(),
      phaseMetrics: this.phases,
      qualityTrends: this.calculateQualityTrends(),
      productivityMetrics: this.calculateProductivityMetrics(),
    }
  }

  private updateAverageDuration(phase: 'red' | 'green' | 'refactor', duration: number): void {
    const phaseData = this.phases[phase]
    phaseData.avgDuration =
      (phaseData.avgDuration * (phaseData.attempts - 1) + duration) / phaseData.attempts
  }

  private updateAverageLinesOfCode(linesOfCode: number): void {
    const green = this.phases.green
    green.avgLinesOfCode =
      (green.avgLinesOfCode * (green.successes - 1) + linesOfCode) / green.successes
  }

  private calculateAverageCycleDuration(): number {
    if (this.cycles.length === 0) return 0
    return this.cycles.reduce((sum, cycle) => sum + cycle.duration, 0) / this.cycles.length
  }

  private calculateOverallSuccessRate(): number {
    const totalAttempts =
      this.phases.red.attempts + this.phases.green.attempts + this.phases.refactor.attempts
    const totalSuccesses =
      this.phases.red.successes + this.phases.green.successes + this.phases.refactor.successes

    return totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0
  }

  private calculateQualityTrends(): QualityTrends {
    return {
      codeComplexity: 'stable',
      testCoverage: 'improving',
      refactoringFrequency: 'stable',
    }
  }

  private calculateProductivityMetrics(): ProductivityMetrics {
    return {
      featuresPerDay: this.cycles.length / 7, // Assuming weekly tracking
      avgTimeToGreen: this.phases.green.avgDuration,
      refactoringEfficiency:
        this.phases.refactor.refactoringsApplied / Math.max(this.phases.refactor.attempts, 1),
    }
  }
}

// ✅ TDD best practices and patterns
class TDDPractices {
  static readonly BEST_PRACTICES = {
    testNaming: {
      pattern: 'should_[expected_behavior]_when_[condition]',
      examples: [
        'should_return_user_when_valid_id_provided',
        'should_throw_error_when_user_not_found',
        'should_calculate_total_when_items_added',
      ],
    },

    testStructure: {
      pattern: 'Arrange-Act-Assert',
      guidelines: [
        'Arrange: Set up test data and dependencies',
        'Act: Execute the function under test',
        'Assert: Verify the expected outcome',
      ],
    },

    redPhase: {
      rules: [
        'Write the smallest test that fails',
        'Test should fail for the right reason',
        'Focus on one behavior at a time',
        'Use descriptive test names',
      ],
    },

    greenPhase: {
      rules: [
        'Write minimal code to make test pass',
        'Avoid over-engineering',
        'Hardcode values if needed initially',
        'Focus on making test pass, not perfect design',
      ],
    },

    refactorPhase: {
      rules: [
        'Improve code structure without changing behavior',
        'Eliminate duplication',
        'Improve naming and readability',
        'Keep all tests passing',
      ],
    },
  }

  static validateTest(test: Test): ValidationResult {
    const issues: string[] = []

    // Check test naming
    if (!this.isGoodTestName(test.name)) {
      issues.push('Test name should describe expected behavior clearly')
    }

    // Check test structure
    if (!this.hasGoodStructure(test.code)) {
      issues.push('Test should follow Arrange-Act-Assert pattern')
    }

    // Check test focus
    if (!this.isFocused(test.code)) {
      issues.push('Test should focus on one behavior')
    }

    return {
      isValid: issues.length === 0,
      issues,
      score: Math.max(0, 100 - issues.length * 25),
    }
  }

  static generateTestTemplate(unit: TestableUnit): string {
    return `
describe('${unit.name}', () => {
  test('should ${unit.name} when valid input provided', () => {
    // Arrange
    // TODO: Set up test data
    
    // Act
    // TODO: Execute function under test
    
    // Assert
    // TODO: Verify expected outcome
  });
  
  test('should handle edge case when boundary value provided', () => {
    // Arrange
    // TODO: Set up edge case data
    
    // Act
    // TODO: Execute function under test
    
    // Assert
    // TODO: Verify edge case behavior
  });
  
  test('should throw error when invalid input provided', () => {
    // Arrange
    // TODO: Set up invalid data
    
    // Act & Assert
    // TODO: Expect error to be thrown
  });
});
    `.trim()
  }

  private static isGoodTestName(name: string): boolean {
    return name.includes('should') && name.length > 10 && !name.includes('test')
  }

  private static hasGoodStructure(code: string): boolean {
    return code.includes('// Arrange') || code.includes('// Act') || code.includes('// Assert')
  }

  private static isFocused(code: string): boolean {
    // Check if test has only one main assertion
    const assertionCount = (code.match(/expect\(/g) || []).length
    return assertionCount <= 3 // Allow up to 3 related assertions
  }
}

// Supporting interfaces and types
type TDDPhase = 'red' | 'green' | 'refactor'
type ComplexityLevel = 'low' | 'medium' | 'high'
type TestableUnitType = 'validation' | 'transformation' | 'calculation' | 'behavior'

interface FeatureSpec {
  readonly name: string
  readonly requirements: string[]
  readonly acceptanceCriteria: AcceptanceCriteria[]
}

interface AcceptanceCriteria {
  readonly id: string
  readonly description: string
  readonly requirements: string[]
  readonly inputs?: InputSpec[]
  readonly expectedOutputs?: ExpectedOutput[]
  readonly edgeCases?: string[]
  readonly errorCases?: string[]
}

interface InputSpec {
  readonly name: string
  readonly type: string
  readonly sampleValue: string
  readonly constraints?: string[]
}

interface ExpectedOutput {
  readonly name: string
  readonly type: string
  readonly expectedValue: string
}

interface TestableUnit {
  readonly id: string
  readonly name: string
  readonly type: TestableUnitType
  readonly complexity: ComplexityLevel
  readonly requirements: string[]
  readonly inputs: InputSpec[]
  readonly expectedOutputs: ExpectedOutput[]
  readonly edgeCases: string[]
  readonly errorCases: string[]
}

interface TDDResult {
  readonly success: boolean
  readonly feature: FeatureSpec
  readonly cycles: CycleExecution[]
  readonly metrics: TDDMetricsReport
  readonly duration: number
  readonly codeQuality?: CodeQualityAssessment
  readonly testQuality?: TestQualityAssessment
  readonly error?: string
}

interface CycleExecution {
  readonly unit: TestableUnit
  readonly success: boolean
  readonly duration: number
  readonly phase?: TDDPhase
  readonly error?: string
  readonly redResult?: PhaseResult
  readonly greenResult?: PhaseResult
  readonly refactorResult?: PhaseResult
}

interface PhaseResult {
  readonly success: boolean
  readonly phase: TDDPhase
  readonly message?: string
  readonly error?: string
  readonly test?: Test
  readonly testResult?: any
  readonly implementation?: Implementation
  readonly testResults?: any
  readonly opportunities?: RefactoringOpportunity[]
  readonly refactoringsApplied?: RefactoringOpportunity[]
}

interface TestSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly unitUnderTest: TestableUnit
  readonly testType: TestableUnitType
  readonly arrange: TestStep
  readonly act: TestStep
  readonly assert: TestStep
}

interface TestStep {
  readonly description: string
  readonly code: string
}

interface Test {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly code: string
  readonly framework: string
  readonly type: TestableUnitType
  readonly createdAt: Date
}

interface Implementation {
  readonly id: string
  readonly unitId: string
  readonly code: string
  readonly linesOfCode: number
  readonly complexity: number
  readonly createdAt: Date
}

interface RefactoringOpportunity {
  readonly type: string
  readonly description: string
  readonly priority: 'low' | 'medium' | 'high'
  readonly impact: 'low' | 'medium' | 'high'
  readonly effort: 'low' | 'medium' | 'high'
  applied: boolean
}

interface RefactoringResult {
  readonly opportunity: RefactoringOpportunity
  readonly success: boolean
  readonly changes: CodeChange[]
  readonly impact: string
  readonly revertData: any
  readonly error?: string
}

interface CodeChange {
  readonly type: string
  readonly filePath: string
  readonly oldCode: string
  readonly newCode: string
}

interface CodeQualityAssessment {
  readonly complexity: number
  readonly maintainability: number
  readonly testability: number
  readonly coverage: number
  readonly duplication: number
}

interface TestQualityAssessment {
  readonly coverage: number
  readonly readability: number
  readonly maintainability: number
  readonly reliability: number
}

interface CycleMetrics {
  readonly duration: number
  readonly complexity: ComplexityLevel
  readonly timestamp: Date
}

interface PhaseMetrics {
  readonly red: PhaseData
  readonly green: PhaseData & { avgLinesOfCode: number }
  readonly refactor: PhaseData & { refactoringsApplied: number }
}

interface PhaseData {
  attempts: number
  successes: number
  avgDuration: number
}

interface TDDMetricsReport {
  readonly totalCycles: number
  readonly avgCycleDuration: number
  readonly successRate: number
  readonly phaseMetrics: PhaseMetrics
  readonly qualityTrends: QualityTrends
  readonly productivityMetrics: ProductivityMetrics
}

interface QualityTrends {
  readonly codeComplexity: 'improving' | 'stable' | 'declining'
  readonly testCoverage: 'improving' | 'stable' | 'declining'
  readonly refactoringFrequency: 'improving' | 'stable' | 'declining'
}

interface ProductivityMetrics {
  readonly featuresPerDay: number
  readonly avgTimeToGreen: number
  readonly refactoringEfficiency: number
}

interface ValidationResult {
  readonly isValid: boolean
  readonly issues: string[]
  readonly score: number
}

// Placeholder interfaces for external dependencies
interface TestSuite {
  addTest(test: Test): Promise<void>
  runTest(testId: string): Promise<any>
  runAllTests(): Promise<any>
  runIntegrationTests(): Promise<void>
}

interface Codebase {
  addImplementation(implementation: Implementation): Promise<void>
}

class TDDError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'TDDError'
  }
}
````

## 🔗 Related Concepts

- **[Test Planning](test-planning.md)** - Strategic test planning incorporating TDD
- **[Unit Testing](.pair/knowledge/guidelines/testing/testing-implementation/unit-testing.md)** - Unit testing implementation with TDD
- **[Test Coverage](test-coverage.md)** - Coverage analysis in TDD context
- **[Refactoring Patterns](.pair/knowledge/guidelines/code-design/design-principles/README.md)** - Code refactoring principles

## 🎯 Implementation Guidelines

1. **Red Phase Focus**: Write the smallest test that fails for the right reason
2. **Green Phase Discipline**: Implement minimal code to make tests pass
3. **Refactor Phase Rigor**: Improve code quality while keeping all tests green
4. **Test Quality**: Write clear, focused tests that describe expected behavior
5. **Cycle Discipline**: Complete each full cycle before moving to the next feature
6. **Continuous Integration**: Run tests frequently and fix failures immediately
7. **Design Emergence**: Let good design emerge through refactoring rather than big up-front design
8. **Metrics Tracking**: Monitor TDD metrics to improve process effectiveness

## 📏 Benefits

- **Design Quality**: TDD drives better software design through testability requirements
- **Code Confidence**: Comprehensive test coverage provides confidence in changes
- **Refactoring Safety**: Tests enable safe refactoring and continuous improvement
- **Documentation**: Tests serve as living documentation of system behavior
- **Faster Debugging**: Failing tests quickly pinpoint the source of issues
- **Reduced Defects**: Early and continuous testing reduces production defects
- **Development Rhythm**: TDD provides a sustainable development rhythm and feedback loop

---

_Test-Driven Development is a disciplined approach that leads to better design, higher code quality, and more maintainable software through the systematic application of the Red-Green-Refactor cycle._
