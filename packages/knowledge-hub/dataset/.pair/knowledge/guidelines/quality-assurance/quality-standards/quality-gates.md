# Quality Gates Framework

## 🎯 **PURPOSE**

Strategic quality checkpoints ensuring systematic quality compliance at key development phases through automated and manual validation processes that prevent quality regressions and enforce standards compliance.

## 📊 **QUALITY GATE OVERVIEW**

Quality gates serve as decision points in the development pipeline where code must meet predefined quality criteria before proceeding to the next phase. These gates ensure consistent quality standards and prevent defects from propagating downstream.

### **Gate Types**

**Entry Gates**: Prerequisites that must be met before work can begin on a particular phase or feature.

**Process Gates**: Quality checks performed during active development phases to ensure ongoing compliance.

**Exit Gates**: Comprehensive validation performed before work can be considered complete and moved to the next phase.

**Release Gates**: Final quality validation before code is deployed to production environments.

## 🚪 **QUALITY GATE DEFINITIONS**

### **Development Entry Gate**

- **User story acceptance criteria defined and validated**
- **Technical design reviewed and approved**
- **Security requirements identified and documented**
- **Performance requirements specified**
- **Accessibility requirements identified**
- **Test strategy defined and approved**

### **Code Quality Gate**

- **All linting rules pass without violations**
- **Code coverage meets minimum thresholds (80%+ unit tests)**
- **Security scans pass without critical vulnerabilities**
- **Performance budgets are within limits**
- **Code review completed and approved**
- **Accessibility automated tests pass**

### **Integration Gate**

- **All unit tests pass**
- **Integration tests pass successfully**
- **End-to-end tests pass for affected user journeys**
- **Performance tests validate response times**
- **Security tests validate against known vulnerabilities**
- **Accessibility validation confirms WCAG compliance**

### **Pre-Production Gate**

- **User acceptance testing completed successfully**
- **Performance testing validates production-like conditions**
- **Security penetration testing completed**
- **Accessibility manual testing completed**
- **Documentation updated and reviewed**
- **Deployment procedures validated**

### **Production Release Gate**

- **Final security scan completed**
- **Performance monitoring configured**
- **Rollback procedures tested and documented**
- **Monitoring and alerting configured**
- **Release notes completed and approved**
- **Post-release validation plan defined**

## ⚙️ **GATE IMPLEMENTATION**

### **Automated Gate Implementation**

Quality gates should be implemented through automated tools and processes wherever possible to ensure consistency and reduce manual effort.

```yaml
# Example CI/CD Pipeline Quality Gates
quality_gates:
  code_quality:
    - eslint_check: zero_violations
    - typescript_check: no_errors
    - security_scan: no_critical_issues
    - test_coverage: minimum_80_percent

  integration:
    - unit_tests: all_pass
    - integration_tests: all_pass
    - performance_tests: within_budgets
    - accessibility_tests: wcag_aa_compliant

  pre_production:
    - e2e_tests: all_critical_paths_pass
    - security_tests: penetration_test_pass
    - performance_load_tests: sla_requirements_met
```

### **Manual Gate Validation**

Some quality aspects require human judgment and cannot be fully automated. These should be systematically performed and documented.

**Code Review Checklist**:

- Code follows established patterns and conventions
- Business logic is correctly implemented
- Error handling is comprehensive and appropriate
- Security considerations are properly addressed
- Performance implications are understood and acceptable

**User Experience Validation**:

- User workflows are intuitive and efficient
- Accessibility features work effectively with assistive technologies
- Performance is acceptable under real-world conditions
- Error messages are helpful and actionable

## 📊 **GATE METRICS AND MONITORING**

### **Gate Success Metrics**

- **Gate Pass Rate**: Percentage of attempts that successfully pass each gate
- **Gate Failure Analysis**: Common reasons for gate failures and trends
- **Time to Resolution**: Average time to address gate failures
- **Quality Trend Analysis**: Quality metrics improvement over time

### **Process Improvement Metrics**

- **False Positive Rate**: Gates that fail but shouldn't (process improvement needed)
- **False Negative Rate**: Issues that pass gates but cause problems later
- **Gate Efficiency**: Time and effort required to execute gate validation
- **Developer Satisfaction**: Team feedback on gate effectiveness and efficiency

## 🔄 **GATE CONFIGURATION**

### **Threshold Management**

Quality gate thresholds should be configurable and adjustable based on:

- **Project Risk Level**: Higher risk projects require stricter gates
- **Team Maturity**: More experienced teams may have different threshold requirements
- **Product Type**: Different product types may have different quality requirements
- **Regulatory Requirements**: Compliance needs may dictate specific thresholds

### **Gate Customization**

Quality gates should be customizable based on:

- **Feature Type**: New features vs. bug fixes may have different requirements
- **Impact Level**: High-impact changes require more comprehensive validation
- **Urgency**: Critical fixes may have expedited gate processes
- **Technology Stack**: Different technologies may require specific validations

### **Custom Gate Registry Format**

Projects can define additional quality gates beyond the standard ones (Lint, Type Check, Test) via a **Custom Gate Registry** table in [way-of-working.md](../../../../adoption/tech/way-of-working.md). Custom gates run after the standard gates.

#### Table schema:

| Column      | Description                                                                        |
| ----------- | ---------------------------------------------------------------------------------- |
| Order       | Execution sequence among custom gates (standard gates always run first)            |
| Gate        | Human-readable gate name                                                           |
| Command     | Shell command to execute (e.g., `pnpm prettier:fix`)                               |
| Scope Key   | Maps to `/verify-quality` `$scope` argument for selective execution                |
| Required    | `Yes` = failure → FAIL verdict; `No` (Advisory) = failure → WARNING, not a blocker |
| Description | Brief explanation of what the gate checks                                          |

#### Enforcement levels:

- **Required** (`Yes`): Gate failure contributes to overall FAIL. The composing skill decides the consequence (e.g., `/implement` HALTs, `/review` reports as finding).
- **Advisory** (`No`): Gate failure produces a WARNING. Does not block the pipeline. Useful for auto-fixers (formatting) or informational checks.

**Standard gates** (Lint, Type Check, Test) are built into `/verify-quality` and always Required. Do not duplicate them in the Custom Gate Registry.

**Adding a custom gate**: Add a row to the Custom Gate Registry table in `way-of-working.md`. The gate becomes available on the next `/verify-quality` invocation.

## 🎯 **SUCCESS CRITERIA**

- **100% Gate Compliance**: All code must pass appropriate quality gates
- **<10% Gate Failure Rate**: Most attempts should pass gates on first try
- **<2 Hour Gate Resolution**: Fast feedback and resolution of gate failures
- **Zero Critical Issues in Production**: Gates effectively prevent serious issues
- **95% Developer Satisfaction**: Gates are seen as helpful rather than impediments
