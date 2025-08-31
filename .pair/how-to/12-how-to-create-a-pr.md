# How to Create a Pull Request - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively create comprehensive pull requests that facilitate effective code review, maintain project history, and ensure seamless integration of changes following established team conventions and development methodology. **Pull request creation is always performed before the code review step** (see [How to Code Review](13-how-to-code-review.md)). Pull request creation transforms **committed implementation work** into reviewable units that support collaborative code validation, automated quality gates, and structured merge processes.

**Important:**

- The pull request must be created **before** the code review process begins (see [How to Code Review](13-how-to-code-review.md)).
- **If the team adoption in `.pair/tech/adopted/way-of-working.md` specifies that the branch must be merged with a single squashed commit**, you must squash all changes into one commit before creating the PR, following the conventions and templates in [How to Commit and Push](11-how-to-commit-and-push.md).

**Key Benefits of Structured Pull Request Creation:**

- Transform committed TDD implementation into reviewable code changes with clear context
- Ensure pull request traceability from user stories through tasks to specific implementation decisions
- Maintain consistency with established pull request templates, naming conventions, and review processes
- Enable automated CI/CD validation through proper pull request structure and metadata
- Facilitate effective code review through comprehensive description and documentation
- Support merge strategy decisions through clear implementation scope and impact analysis
- Provide structured communication channels for reviewer feedback and implementation discussion
- Enable automated project management updates through proper pull request lifecycle management

**Important: Pull requests follow committed implementation workflow** - they represent the code review preparation phase where committed TDD work becomes structured review units while maintaining traceability to requirements and architectural decisions.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer

The AI assistant acts as a **Product Software Engineer** who:

- **Analyzes** current branch status and committed implementation ready for pull request creation
- **Studies** user story specifications and task requirements to understand implementation context
- **Examines** previous pull requests to understand team patterns, reviewer assignments, and successful templates
- **Generates** comprehensive pull request descriptions following established templates and conventions
- **Identifies** appropriate reviewers based on code area expertise and team historical patterns
- **Validates** continuous integration requirements and automated quality gate readiness
- **Manages** pull request creation workflow with proper metadata, labels, and assignment
- **Updates** project management status to reflect pull request creation and review initiation
- **Ensures** consistency with established merge strategies and post-merge cleanup procedures
- **Maintains** clear communication throughout pull request lifecycle from creation to merge

**Working Principles**: Follow the **🤖🤝👨‍💻** model (AI generates pull request structure, Developer approves) throughout the entire pull request creation process.

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/tech/adopted/way-of-working.md](.pair/tech/adopted/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/tech/adopted/way-of-working.md](.pair/tech/adopted/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](./02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### **Filesystem Access Rules**

**✅ PERMITTED ONLY when:**

- Tool in [way-of-working.md](.pair/tech/adopted/way-of-working.md) = "filesystem"

**🚫 PROHIBITED when:**

- Any other tool is configured
- **DO NOT** read [.pair/product/backlog/](.pair/product/backlog/) directories
- **DO NOT** use filesystem as fallback

### **Validation Checklist**

- [ ] [way-of-working.md](.pair/tech/adopted/way-of-working.md) read and tool identified
- [ ] Tool configured (if not: halt and request bootstrap)
- [ ] [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) consulted for access procedures

## Pull Request Definition

### What is a Pull Request in Development Context?

A **Pull Request** is the **code review preparation phase** where:

- **Transforms Committed Work**: Converts organized commit history into reviewable code changes with comprehensive context
- **Follows PR Templates**: Adheres to established pull request description formats with story references and implementation details
- **Enables Code Review**: Provides structured format for team code review, feedback, and approval processes
- **Supports CI/CD Integration**: Triggers automated testing, quality validation, and deployment pipeline processes
- **Maintains Traceability**: Links implementation changes back to user stories, tasks, acceptance criteria, and architectural decisions
- **Documents Implementation**: Includes comprehensive description of changes, reasoning, and impact analysis
- **Facilitates Collaboration**: Provides communication channel for reviewer feedback, questions, and implementation discussion
- **Manages Merge Process**: Supports appropriate merge strategies and post-merge cleanup procedures

**Pull requests are collaborative and traceable** - they follow established team review processes while maintaining consistency with TDD methodology and architectural patterns.

### Pull Request Types and Context Integration

| PR Type      | Context              | Purpose                                                | Description Focus                                                         |
| ------------ | -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Feature**  | Story Implementation | Implement new functionality for user value             | User story context, acceptance criteria coverage, feature impact          |
| **Bugfix**   | Issue Resolution     | Correct identified bugs or issues                      | Problem description, root cause analysis, fix verification                |
| **Refactor** | Code Quality         | Improve code structure without behavior changes        | Technical debt reduction, maintainability improvements, performance gains |
| **Chore**    | Non-Functional Tasks | Update dependencies, tooling, configuration            | Infrastructure improvements, maintenance tasks, setup changes             |
| **Docs**     | Documentation        | Add or update documentation, guides, or specifications | Documentation coverage, user impact, information accuracy                 |
| **Hotfix**   | Critical Issues      | Emergency fixes for production issues                  | Urgency justification, risk assessment, deployment requirements           |

## Prerequisites Verification

### Step 0: Branch and Commit Analysis

**AI Assistant Instructions:** Begin with comprehensive branch status and commit history analysis:

**Phase 0A: Current Branch Status Analysis**

1. **Analyze Branch and Commit Status**: Check current development state and commit readiness:

   ```bash
   # Verify current branch and commit status
   git status
   git log --oneline origin/main..HEAD
   git branch -vv
   # Check if commits are pushed to remote
   git log --oneline origin/$(git branch --show-current)..HEAD
   ```

2. **Extract Story and Implementation Context**: From branch naming and commit history:

   ```bash
   # Extract story code from branch name
   BRANCH_NAME=$(git branch --show-current)
   # Parse story code pattern (e.g., feature/STORY-123-description)
   echo "Branch: $BRANCH_NAME"
   # Analyze commit messages for context
   git log --oneline origin/main..HEAD --grep="STORY"
   ```

3. **Validate Commit Synchronization**: Ensure all commits are pushed:

   **Ready for Pull Request:**

   - All implementation commits pushed to remote branch
   - Commit history properly organized (squashed if required)
   - Branch synchronized with remote origin
   - No uncommitted changes in working directory

   **Not Ready for Pull Request:**

   - Unpushed local commits remaining
   - Working directory has uncommitted changes
   - Branch not synchronized with remote
   - Commit organization incomplete

**Phase 0B: User Story and Task Context Loading**

4. **Check Project Management Tool Configuration**: Determine how to load story context:

   ```bash
   # Check team's adopted way-of-working for project management tool
   WAY_OF_WORKING_FILE=".pair/tech/adopted/way-of-working.md"
   if [ -f "$WAY_OF_WORKING_FILE" ]; then
       echo "Loading project management configuration from: $WAY_OF_WORKING_FILE"
       # Extract project management tool configuration
   fi
   ```

   **Project Management Tool Detection:**

   _"Checking team's adopted way-of-working for project management configuration..."_

   - Detected Tool: [TOOL_NAME] (e.g., Jira, Azure DevOps, GitHub Projects, File System from .pair/tech/adopted/way-of-working.md)

5. **Load User Story Context Using Configured Tool**: Extract story context based on tool configuration.

   **Story Context Loading Result:**
   _"Loading User Story context for PR creation using [CONFIGURED_TOOL]:_

   **Tool Configuration:**

   - Project Management Tool: [TOOL_NAME] (configured in adoptions)
   - Story Loading Method: [API/File System/Other]
   - Authentication: [Configured/Required/Available]

   **Story Information:**

   - Story Code: [STORY_CODE]
   - Story Title: [STORY_TITLE]
   - Acceptance Criteria: [AC_LIST]
   - Tasks Implemented: [TASK_LIST]
   - Epic Reference: [EPIC_ID]
   - Story Status: [CURRENT_STATUS]

   **Implementation Analysis:**

   - Commits addressing story: [COMMIT_COUNT] commits
   - Task coverage: [COMPLETED_TASKS] of [TOTAL_TASKS] tasks complete
   - Acceptance criteria coverage: [AC_COVERAGE_ANALYSIS]
   - Implementation scope: [SCOPE_DESCRIPTION]"\_

6. **Handle Tool Integration Issues**: Provide fallback approaches:

   **If Tool Integration Not Available:**
   _"Project management tool integration not available or configured. Using branch name analysis and commit history for context:_

   **Branch Analysis:**

   - Branch Name: [BRANCH_NAME]
   - Extracted Story Code: [STORY_CODE]
   - Story Pattern: [DETECTED_PATTERN]

   **Commit History Analysis:**

   - Story references in commits: [COMMIT_REFERENCES]
   - Task references found: [TASK_REFERENCES]
   - Implementation scope from commits: [COMMIT_SCOPE]

   **Recommendation**: Consider configuring project management tool integration in `.pair/tech/adopted/way-of-working.md` for better story context loading."\_

**Phase 0C: Previous Pull Request Pattern Analysis**

6. **Study Previous Pull Requests**: Analyze team patterns and reviewer assignments:

   ```bash
   # Check previous PRs for patterns (if using GitHub CLI)
   gh pr list --state merged --limit 10
   # Or check git log for merge commit patterns
   git log --merges --oneline -10
   ```

7. **Extract Team Review Patterns**: Identify reviewer assignment patterns:

   _"Analyzing previous pull request patterns:_

   **Recent Merged PRs:**

   - [PR_TITLE_1]: Reviewers - [REVIEWER_LIST_1]
   - [PR_TITLE_2]: Reviewers - [REVIEWER_LIST_2]
   - [PR_TITLE_3]: Reviewers - [REVIEWER_LIST_3]

   **Identified Patterns:**

   - Code area experts: [EXPERT_ASSIGNMENTS]
   - Team rotation patterns: [ROTATION_ANALYSIS]
   - Required reviewers: [REQUIRED_REVIEWERS]
   - Typical review team size: [TEAM_SIZE]"\_

## Pull Request Template and Structure

### Step 1: Pull Request Description Generation

**AI Assistant Instructions:** Generate comprehensive pull request description following team templates:

1. **Check for Existing PR Templates**: Look for team-established templates:

   ```bash
   # Check for GitHub PR template
   ls -la .github/pull_request_template.md .github/PULL_REQUEST_TEMPLATE.md
   # Check for team-adopted PR templates
   ls -la .pair/tech/adopted/pr-template.md .pair/templates/pull-request.md
   ```

2. **Generate PR Description Using Template**: Follow established format or create comprehensive description:

   **Standard Pull Request Template:**

   ```markdown
   ## Summary

   Brief description of what this PR accomplishes and why it was needed.

   ## Related User Story

   - **Story Code**: [STORY_CODE]
   - **Story Title**: [STORY_TITLE]
   - **Epic**: [EPIC_REFERENCE]

   ## Changes Made

   ### Implementation Details

   - [Specific change 1 with technical context]
   - [Specific change 2 with technical context]
   - [Specific change 3 with technical context]

   ### Technical Decisions

   - [Architectural decision 1 with reasoning]
   - [Architectural decision 2 with reasoning]

   ## Acceptance Criteria Coverage

   - ✅ **AC-1**: [Acceptance criteria description] - [Implementation approach]
   - ✅ **AC-2**: [Acceptance criteria description] - [Implementation approach]
   - ✅ **AC-3**: [Acceptance criteria description] - [Implementation approach]

   ## Testing

   ### Test Coverage

   - [Test category 1]: [Coverage details]
   - [Test category 2]: [Coverage details]

   ### Manual Testing Steps

   1. [Step 1 with expected outcome]
   2. [Step 2 with expected outcome]
   3. [Step 3 with expected outcome]

   ## Impact Analysis

   ### Areas Affected

   - [Component/Area 1]: [Impact description]
   - [Component/Area 2]: [Impact description]

   ### Breaking Changes

   - [ ] No breaking changes
   - [ ] Breaking changes (describe below)

   ### Database Changes

   - [ ] No database changes
   - [ ] Database changes (describe below)

   ## Review Notes

   ### Key Review Points

   - [Point 1 requiring reviewer attention]
   - [Point 2 requiring reviewer attention]

   ### Questions for Reviewers

   - [Question 1 about specific implementation choice]
   - [Question 2 about architectural decision]

   ## Deployment Notes

   ### Pre-deployment Requirements

   - [Requirement 1]
   - [Requirement 2]

   ### Post-deployment Validation

   - [Validation 1]
   - [Validation 2]

   ---

   **Commits in this PR:**
   [AUTO-GENERATED COMMIT LIST]

   **Files Changed:**
   [AUTO-GENERATED FILE LIST WITH CHANGE SUMMARY]
   ```

3. **Generate Specific PR Description**: Fill template with current implementation context:

   _"Generating pull request description for User Story [STORY_CODE]:_

   **Generated PR Title:**
   `[STORY_CODE]: [Brief descriptive title under 60 chars]`

   **Generated PR Description:**
   [**Complete PR description following template with all sections filled**]

   _This description includes:_

   - _Complete story context and traceability to epic_
   - _Detailed implementation changes with technical reasoning_
   - _Full acceptance criteria coverage analysis_
   - _Comprehensive testing approach and manual validation steps_
   - _Impact analysis for affected system areas_
   - _Specific review guidance and questions for team_
   - _Deployment considerations and validation requirements_

   _Please review this PR description and approve, or suggest modifications to better represent the implementation context."_

### Step 2: Reviewer Assignment Strategy

**AI Assistant Instructions:** Propose appropriate reviewer assignments based on analysis:

1. **Identify Required Reviewers**: Based on code changes and team patterns:

   **Code Area Analysis:**

   ```bash
   # Analyze changed files for code area identification
   git diff --name-only origin/main..HEAD | head -20
   # Count lines changed by file type
   git diff --stat origin/main..HEAD
   ```

2. **Propose Reviewer Assignment**: Based on expertise and team patterns:

   _"Based on code analysis and previous PR patterns, I recommend the following reviewer assignment:_

   **Primary Reviewers (Required):**

   - **[REVIEWER_1]**: [Area of expertise relevant to changes]
   - **[REVIEWER_2]**: [Area of expertise relevant to changes]

   **Secondary Reviewers (Suggested):**

   - **[REVIEWER_3]**: [Additional perspective or knowledge area]

   **Assignment Reasoning:**

   - [REVIEWER_1] has expertise in [specific area] affected by changes
   - [REVIEWER_2] has been primary reviewer for similar [component/feature] changes
   - [REVIEWER_3] provides [architectural/business] perspective on implementation
   - This assignment follows team rotation and maintains knowledge distribution

   **Review Team Size:** [X] reviewers (consistent with team pattern of [Y]-[Z] reviewers)

   _Would you like to proceed with this reviewer assignment, or would you prefer different reviewers?"_

### Step 3: CI/CD and Quality Validation

**AI Assistant Instructions:** Ensure pull request meets automated quality requirements:

1. **Validate CI/CD Configuration**: Check automated pipeline readiness:

   ```bash
   # Check for CI/CD configuration files
   ls -la .github/workflows/ .gitlab-ci.yml azure-pipelines.yml
   # Verify branch protection rules alignment
   # Check for required status checks configuration
   ```

2. **Pre-PR Quality Gate Validation**: Ensure quality standards:

   ```bash
   # Validate test suite passes
   pnpm test
   # Check code quality standards
   pnpm run lint
   # Validate build process
   pnpm run build
   # Check for security vulnerabilities
   pnpm audit
   ```

3. **Quality Validation Report**: Document readiness for automated checks:

   _"Pre-PR quality validation completed:_

   **Automated Quality Gates:**

   - ✅ **Test Suite**: All [X] tests passing
   - ✅ **Code Quality**: Linting validation successful
   - ✅ **Build Process**: Build completes without errors
   - ✅ **Security Scan**: No vulnerabilities detected
   - ✅ **Coverage**: Test coverage at [X]% (meets [Y]% requirement)

   **CI/CD Pipeline Readiness:**

   - ✅ **Configuration**: Valid CI/CD configuration detected
   - ✅ **Branch Status**: Branch ready for automated checks
   - ✅ **Dependencies**: All dependencies properly resolved
   - ✅ **Environments**: Target environments accessible

   _Pull request is ready for creation with all quality gates satisfied. Automated pipelines will validate changes upon PR creation."_

## Pull Request Creation Execution

### Step 4: Pull Request Creation

**AI Assistant Instructions:** Execute pull request creation with approved parameters:

1. **Create Pull Request with Generated Content**: Using approved description and reviewers:

   > **Important:** For GitHub repositories, the pull request must be created using the MCP GitHub integration (not the GitHub CLI `gh`).
   > Use the MCP GitHub workflow and API to ensure traceability, compliance, and automation with project management and review processes.

   ```bash
   # Create PR using MCP GitHub integration (replace with actual MCP commands)
   mcp github pr create \
     --title "[APPROVED_PR_TITLE]" \
     --body "[APPROVED_PR_DESCRIPTION]" \
     --reviewer "[APPROVED_REVIEWERS]" \
     --assignee "[DEVELOPER_ASSIGNMENT]" \
     --label "[APPROPRIATE_LABELS]"

   # Or provide instructions for manual PR creation
   echo "Manual PR creation required with provided title, description, and reviewers"
   ```

   Assign branch to the pull request this featureis supported it.

2. **PR Creation Confirmation**: Validate successful creation:

   _"Pull request created successfully:_

   **PR Information:**

   - **PR Number**: #[PR_NUMBER]
   - **Title**: [PR_TITLE]
   - **Branch**: `[SOURCE_BRANCH]` → `[TARGET_BRANCH]`
   - **Reviewers**: [ASSIGNED_REVIEWERS]
   - **Labels**: [APPLIED_LABELS]

   **Automated Checks:**

   - ✅ **CI/CD Pipeline**: Triggered automatically
   - ✅ **Quality Gates**: Running automated validation
   - ✅ **Security Scans**: Initiated for code changes
   - ✅ **Test Execution**: Running full test suite

   _Pull request is now available for team review at: [PR_URL]"_

### Step 5: Project Management Status Update

**AI Assistant Instructions:** Update project tracking to reflect PR creation using configured tool:

1. **Update Task and Story Status Using Configured Tool**: Reflect PR creation in project management:

   **Tool-Based Status Update Process:**

   ```bash
   # Check configured project management tool
   WAY_OF_WORKING_FILE=".pair/tech/adopted/way-of-working.md"
   # Extract tool configuration from adoptions
   ```

   **File System Project Management Updates (if configured):**

   ```bash
   # Update story status to "In Review" in file system
   # Add PR reference to task completion records
   # Update epic progress with PR creation status
   ```

   **External Tool Updates (if configured):**

   **Jira Integration Example:**

   ```bash
   # Update Jira issue status to "In Review"
   # Add PR reference as comment or custom field
   # Update epic progress in Jira
   ```

   **Azure DevOps Integration Example:**

   ```bash
   # Update work item state to "In Review"
   # Link PR to work item
   # Update feature/epic progress
   ```

   **GitHub Projects Integration Example:**

   ```bash
   # Move issue to "In Review" column
   # Link PR to issue automatically via GitHub
   # Update project board status
   ```

   **Universal Status Update Process:**

   - Update story status from "Implementation Complete" to "In Review"
   - Add PR reference ([PR_NUMBER]) to all related tasks
   - Update epic progress to reflect code review phase
   - Maintain traceability from tasks through commits to PR using tool-specific methods

2. **Generate Tool-Specific Status Update Summary**: Document project management changes:

   _"Project management status updated for PR creation using [CONFIGURED_TOOL]:_

   **Tool Configuration:**

   - Project Management Tool: [TOOL_NAME] (from adoptions)
   - Integration Method: [API/File System/Manual]
   - Update Status: [Successful/Failed/Partial]

   **Story Status Updates:**

   - **[STORY_CODE]**: Status changed to "In Review" with PR reference #[PR_NUMBER]
   - **Tool-Specific Fields**: [Custom fields, labels, or properties updated]
   - **Epic Progress**: [EPIC_ID] updated to reflect code review phase

   **Tasks Updated:**

   - All related tasks updated with PR traceability using [TOOL_SPECIFIC_METHOD]
   - Task status reflected in [TOOL_NAME] with appropriate workflow states
   - Cross-references maintained between tasks, commits, and PR

   **Traceability Maintained:**

   - User Story → Tasks → Commits → Pull Request #[PR_NUMBER]
   - Acceptance criteria mapped to specific code changes in PR
   - Epic progress accurately reflects development phase in [TOOL_NAME]

   _Project tracking is now consistent with PR creation and ready for review workflow using [TOOL_NAME]."_

3. **Handle Tool Integration Issues**: Provide fallback approaches:

   **If Tool Integration Fails:**
   _"Project management tool update encountered issues:_

   **Issue Details:**

   - Tool: [TOOL_NAME]
   - Error: [ERROR_DESCRIPTION]
   - Impact: [STATUS_UPDATE_IMPACT]

   **Manual Update Required:**

   - Story [STORY_CODE]: Manually update status to "In Review"
   - PR Reference: Add #[PR_NUMBER] to story/task description
   - Epic Progress: Manually update [EPIC_ID] progress

   **Recommendation**: Check tool configuration in `.pair/tech/adopted/way-of-working.md` and verify API credentials or permissions."\_

## Communication and Notification Protocols

### Step 6: Review Communication Setup

**AI Assistant Instructions:** Establish communication channels for effective review process:

1. **Generate Review Request Message**: Prepare communication for reviewers:

   **Review Request Template:**

   ```markdown
   Hi @[REVIEWER_1] @[REVIEWER_2],

   I've created PR #[PR_NUMBER] for User Story [STORY_CODE]: [STORY_TITLE].

   **Key Review Areas:**

   - [Area 1]: [Specific focus point]
   - [Area 2]: [Specific focus point]
   - [Area 3]: [Specific focus point]

   **Questions for Review:**

   - [Question 1 about implementation approach]
   - [Question 2 about architectural decision]

   **Testing:** [Brief testing summary]
   **Impact:** [Brief impact summary]

   The PR includes [X] commits covering [scope description].
   All automated checks are passing.

   Please let me know if you have questions or need clarification on any implementation choices.

   Thanks!
   ```

2. **Communication Channel Setup**: Establish review workflow communication:

   _"Review communication setup completed:_

   **Reviewer Notifications:**

   - All assigned reviewers automatically notified via [platform] notifications
   - Review request message prepared for additional context
   - Team Slack/Discord notification ready (if configured)

   **Communication Channels:**

   - **PR Comments**: Primary discussion channel for code-specific feedback
   - **Team Chat**: Available for quick questions and clarifications
   - **Review Meetings**: Can be scheduled if complex discussion needed

   **Response Expectations:**

   - Initial review acknowledgment within [X] business hours
   - Complete review within [Y] business days
   - Feedback incorporated and addressed promptly

   _Communication channels established for effective collaborative review process."_

### Step 7: Post-Creation Branch Management

**AI Assistant Instructions:** Manage branch status after PR creation:

1. **Return to Main Branch**: Clean up development environment:

   ```bash
   # Switch back to main branch for continued development
   git checkout main
   # Update main branch with latest changes
   git pull origin main
   # Clean up any temporary files
   git clean -fd
   ```

2. **Prepare Development Environment**: Ready for next work:

   ```bash
   # Verify clean main branch status
   git status
   # Verify build and test status on main
   pnpm install  # ensure dependencies up to date
   pnpm test     # verify main branch test state
   ```

3. **Development Environment Confirmation**: Validate readiness for continued work:

   _"Development environment prepared for continued work:_

   **Branch Status:**

   - ✅ **Current Branch**: Switched to `main` branch
   - ✅ **Branch Status**: Clean working directory
   - ✅ **Latest Code**: Main branch updated with latest changes
   - ✅ **Dependencies**: All dependencies current and installed

   **Ready for Next Work:**

   - ✅ **Build Status**: Main branch builds successfully
   - ✅ **Test Status**: All tests passing on main branch
   - ✅ **Quality Status**: No linting or quality issues
   - ✅ **Environment**: Development environment clean and ready

   _Developer can now continue with next story implementation while PR #[PR_NUMBER] undergoes review process. Feature branch remains available for any review-requested changes."_

## Continuous Integration Validation

### Automated Quality Gate Configuration

**CI/CD Integration Points:**

- [ ] **Automated Test Execution**: Full test suite runs on PR creation
- [ ] **Code Quality Validation**: Linting, formatting, and static analysis
- [ ] **Security Scanning**: Vulnerability assessment and dependency audit
- [ ] **Build Verification**: Application builds successfully across environments
- [ ] **Coverage Validation**: Test coverage meets established thresholds
- [ ] **Performance Testing**: Automated performance regression detection
- [ ] **Integration Testing**: End-to-end testing in staging environment
- [ ] **Documentation Validation**: Generated docs build and link verification

### Quality Gate Success Criteria

**Required Checks (Must Pass):**

- [ ] **Test Suite**: 100% of automated tests passing
- [ ] **Build Process**: Successful build in all target environments
- [ ] **Code Quality**: No linting errors, critical security issues, or style violations
- [ ] **Coverage Threshold**: Test coverage above [team-defined]% minimum
- [ ] **Security Scan**: No high or critical vulnerability findings
- [ ] **Integration Tests**: All end-to-end scenarios passing
- [ ] **Performance**: No significant performance regression detected
- [ ] **Documentation**: All generated documentation builds successfully

**Optional Checks (May Have Exceptions):**

- [ ] **Performance Optimization**: Performance improvements detected
- [ ] **Documentation Coverage**: Documentation updated for new features
- [ ] **Accessibility**: Accessibility validation passing for UI changes
- [ ] **Browser Compatibility**: Cross-browser testing successful
- [ ] **Mobile Compatibility**: Mobile responsive design validation
- [ ] **API Compatibility**: Backwards compatibility maintained
- [ ] **Deployment Readiness**: Staging deployment successful

## Merge Strategies and Considerations

### Merge Strategy Selection

| Strategy             | Use Case                                 | Benefits                                           | Considerations                        |
| -------------------- | ---------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| **Squash and Merge** | Feature development, clean history       | Linear history, single commit per story            | Loses detailed commit history         |
| **Merge Commit**     | Collaborative features, maintain context | Preserves branch history, clear feature boundaries | More complex history graph            |
| **Rebase and Merge** | Clean integration, maintain commits      | Linear history with preserved commits              | Potential conflicts, rewrites history |

### Pre-Merge Validation

**Merge Readiness Checklist:**

- [ ] **All Reviews Approved**: Required reviewers have approved changes
- [ ] **CI/CD Passing**: All automated quality gates successful
- [ ] **Conflicts Resolved**: No merge conflicts with target branch
- [ ] **Documentation Updated**: Relevant documentation reflects changes
- [ ] **Breaking Changes Documented**: Any breaking changes properly communicated
- [ ] **Migration Scripts**: Database or configuration migrations prepared
- [ ] **Rollback Plan**: Rollback procedure documented for deployment
- [ ] **Stakeholder Approval**: Business stakeholder approval if required

### Post-Merge Cleanup Procedures

**Automated Cleanup Tasks:**

- [ ] **Branch Deletion**: Feature branch deleted after successful merge
- [ ] **Tag Creation**: Version tag created for release preparation
- [ ] **Changelog Update**: Automated changelog generation and update
- [ ] **Documentation Deployment**: Updated documentation deployed
- [ ] **Notification Sending**: Team notifications about merge completion
- [ ] **Project Status Update**: Project management status updated to "Merged"
- [ ] **Deployment Triggering**: Automated deployment to staging/production
- [ ] **Monitoring Setup**: Deployment monitoring and alerting activated
- [ ] **User Story Closure**: User story closed in the project management tool after positive code review
- [ ] **Branch Deletion**: Feature branch deleted after successful merge and code review

## Quality Assurance Framework

### Pull Request Quality Standards

**PR Description Quality:**

- [ ] **Story Context**: Clear reference to user story and business value
- [ ] **Implementation Details**: Comprehensive description of changes made
- [ ] **Technical Decisions**: Reasoning for architectural and design choices
- [ ] **AC Coverage**: Explicit mapping to acceptance criteria fulfillment
- [ ] **Testing Strategy**: Description of test coverage and validation approach
- [ ] **Impact Analysis**: Assessment of affected systems and components
- [ ] **Review Guidance**: Clear direction for reviewers on focus areas
- [ ] **Deployment Notes**: Requirements and considerations for deployment

**Change Organization Quality:**

- [ ] **Atomic Scope**: PR represents logical, complete unit of work
- [ ] **Single Purpose**: Changes serve unified story or technical objective
- [ ] **Appropriate Size**: PR size manageable for effective review (typically <500 lines)
- [ ] **File Organization**: Changes logically organized and easy to follow
- [ ] **Commit Quality**: Clean commit history supporting review process
- [ ] **Branch Hygiene**: Feature branch properly maintained and synchronized
- [ ] **Documentation Updates**: Code changes accompanied by relevant documentation
- [ ] **Test Coverage**: Adequate test coverage for all functional changes

### Review Process Quality

**Reviewer Assignment Standards:**

- [ ] **Expertise Alignment**: Reviewers have relevant technical expertise
- [ ] **Knowledge Distribution**: Review assignment supports team knowledge sharing
- [ ] **Team Rotation**: Review load distributed fairly across team members
- [ ] **Required Coverage**: Critical areas covered by experienced reviewers
- [ ] **Conflict of Interest**: No reviewer conflicts with implementation approach
- [ ] **Availability**: Assigned reviewers available within required timeline
- [ ] **Context Understanding**: Reviewers understand story and technical context
- [ ] **Review Capacity**: Reviewer workload allows for thorough review

## Best Practices for AI Assistants

### Pull Request Creation Do's:

- **Always analyze branch status and commit synchronization** before PR creation
- **Study user story context and acceptance criteria** to generate comprehensive descriptions
- **Examine previous PR patterns** to understand team reviewer assignment and template preferences
- **Generate complete PR descriptions** following established templates with full context
- **Propose appropriate reviewers** based on code expertise and team rotation patterns
- **Validate CI/CD readiness** ensuring all automated quality gates will pass
- **Update project management status** accurately to reflect code review phase
- **Provide clear communication channels** for effective reviewer collaboration
- **Return to main branch** after PR creation for continued development readiness
- **Document merge strategy recommendations** based on change scope and team standards

### Pull Request Creation Don'ts:

- **Never create PR without analyzing story and implementation context** - understand business value and technical scope
- **Don't use generic PR descriptions** without specific story context, acceptance criteria coverage, and implementation details
- **Never assign reviewers randomly** - consider code expertise, team patterns, and knowledge distribution
- **Don't create PRs with failing quality gates** - ensure all automated checks will pass
- **Never skip project management updates** - maintain accurate status tracking throughout review process
- **Don't create oversized PRs** - ensure changes are reviewable and represent logical scope
- **Never ignore CI/CD configuration** - validate automated pipeline compatibility
- **Don't forget deployment considerations** - include necessary deployment notes and requirements
- **Never skip communication setup** - establish clear channels for review feedback
- **Don't leave development environment inconsistent** - return to clean main branch state

## Common Pitfalls and Solutions

| Pitfall                                     | Impact                                                  | Solution                                                                  |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Generic PR descriptions without context** | Poor reviewer understanding and ineffective review      | Always include story context, AC coverage, and implementation reasoning   |
| **Inappropriate reviewer assignment**       | Inadequate review quality and team knowledge gaps       | Analyze code changes and assign reviewers based on expertise and rotation |
| **Creating PRs with failing quality gates** | Blocked review process and CI/CD failures               | Validate all quality gates locally before PR creation                     |
| **Oversized PRs difficult to review**       | Poor review quality and extended review time            | Keep PRs focused on single story or logical scope                         |
| **Missing deployment considerations**       | Deployment issues and production problems               | Include deployment notes, migration requirements, and rollback plans      |
| **Poor commit organization in PR**          | Difficult code review and unclear change history        | Organize commits properly before PR creation (squash when appropriate)    |
| **Inadequate testing documentation**        | Reviewer uncertainty about validation approach          | Document test coverage, manual testing steps, and validation criteria     |
| **Missing impact analysis**                 | Unexpected system effects and integration issues        | Analyze and document all affected components and systems                  |
| **Inconsistent project status updates**     | Project tracking inaccuracy and progress confusion      | Update all related tasks, stories, and epic status with PR references     |
| **Poor communication channel setup**        | Ineffective reviewer collaboration and delayed feedback | Establish clear communication channels and response expectations          |

## Pull Request Templates

### Feature Implementation Template

```markdown
## Summary

Implementation of [User Story Title] providing [brief business value description].

## Related User Story

- **Story Code**: [STORY_CODE]
- **Story Title**: [STORY_TITLE]
- **Epic**: [EPIC_REFERENCE]
- **Business Value**: [VALUE_DESCRIPTION]

## Changes Made

### Core Implementation

- [Implementation detail 1 with technical context]
- [Implementation detail 2 with technical context]
- [Implementation detail 3 with technical context]

### Technical Decisions

- **[Decision 1]**: [Reasoning and alternatives considered]
- **[Decision 2]**: [Reasoning and alternatives considered]

### Architecture Integration

- [How changes integrate with existing architecture]
- [Any architectural patterns followed or established]

## Acceptance Criteria Coverage

- ✅ **AC-1**: [Criteria description] - [Implementation approach and validation]
- ✅ **AC-2**: [Criteria description] - [Implementation approach and validation]
- ✅ **AC-3**: [Criteria description] - [Implementation approach and validation]

## Testing Strategy

### Automated Test Coverage

- **Unit Tests**: [Coverage description and key test scenarios]
- **Integration Tests**: [Integration testing approach and scenarios]
- **End-to-End Tests**: [E2E testing coverage and user workflows]

### Manual Testing Steps

1. [Manual test step 1 with expected outcome]
2. [Manual test step 2 with expected outcome]
3. [Manual test step 3 with expected outcome]

### Test Results

- **Coverage**: [X]% test coverage ([meets/exceeds] [Y]% requirement)
- **Quality**: All tests passing with comprehensive scenario coverage

## Impact Analysis

### Components Affected

- **[Component 1]**: [Description of changes and impact]
- **[Component 2]**: [Description of changes and impact]
- **[Component 3]**: [Description of changes and impact]

### Integration Points

- **[Integration 1]**: [How integration is maintained or changed]
- **[Integration 2]**: [How integration is maintained or changed]

### Breaking Changes

- [ ] No breaking changes introduced
- [ ] Breaking changes present (detailed below)

### Database Impact

- [ ] No database schema changes
- [ ] Database changes present (migration included)

## Review Guidance

### Key Focus Areas

- [Focus area 1]: [Specific aspects for reviewer attention]
- [Focus area 2]: [Specific aspects for reviewer attention]
- [Focus area 3]: [Specific aspects for reviewer attention]

### Questions for Reviewers

- [Question 1 about specific implementation choice or architectural decision]
- [Question 2 about alternative approaches or optimization opportunities]

### Review Checklist

- [ ] Business logic correctly implements acceptance criteria
- [ ] Code follows established architectural patterns
- [ ] Test coverage is comprehensive and meaningful
- [ ] Documentation updates reflect implementation changes
- [ ] No performance regressions introduced
- [ ] Security considerations properly addressed

## Deployment Considerations

### Pre-deployment Requirements

- [Requirement 1 (e.g., database migration, configuration update)]
- [Requirement 2 (e.g., feature flag configuration, environment setup)]

### Deployment Validation

- [Validation 1 (e.g., health check, functionality verification)]
- [Validation 2 (e.g., integration testing, monitoring setup)]

### Rollback Procedures

- [Rollback step 1 if deployment issues occur]
- [Rollback step 2 if deployment issues occur]

---

**Implementation Summary:**

- **Commits**: [X] commits implementing complete story functionality
- **Files Changed**: [Y] files with [Z] lines added, [W] lines removed
- **TDD Methodology**: Complete RED-GREEN-REFACTOR cycles with comprehensive test coverage

**Quality Gates:**

- ✅ All automated tests passing
- ✅ Code quality validation successful
- ✅ Security scanning clean
- ✅ Performance validation passed
```

### Bug Fix Template

```markdown
## Summary

Fix for [Issue Description] affecting [Affected Functionality].

## Problem Description

### Issue Details

- **Issue ID**: [ISSUE_ID]
- **Severity**: [Critical/High/Medium/Low]
- **Affected Users**: [User group or percentage affected]
- **Environment**: [Production/Staging/Development where issue occurs]

### Root Cause Analysis

- **Primary Cause**: [Technical explanation of what caused the issue]
- **Contributing Factors**: [Secondary factors that enabled the issue]
- **Timeline**: [When issue was introduced and discovered]

### Symptoms

- [Symptom 1]: [Description of observable problem]
- [Symptom 2]: [Description of observable problem]
- [Symptom 3]: [Description of observable problem]

## Solution Implementation

### Fix Details

- [Fix detail 1 with technical explanation]
- [Fix detail 2 with technical explanation]
- [Fix detail 3 with technical explanation]

### Technical Approach

- **Strategy**: [High-level approach to resolving the issue]
- **Implementation**: [Specific technical changes made]
- **Validation**: [How fix correctness is verified]

## Testing and Validation

### Bug Reproduction

- [Step 1 to reproduce original issue]
- [Step 2 to reproduce original issue]
- [Step 3 to reproduce original issue]

### Fix Verification

- [Step 1 to verify issue is resolved]
- [Step 2 to verify issue is resolved]
- [Step 3 to verify issue is resolved]

### Regression Testing

- [Test area 1 to ensure no new issues introduced]
- [Test area 2 to ensure no new issues introduced]

## Impact Assessment

### Risk Analysis

- **Deployment Risk**: [Low/Medium/High] - [Justification]
- **Rollback Complexity**: [Simple/Moderate/Complex] - [Explanation]
- **User Impact**: [Positive impact description]

### Areas Affected

- **[Component 1]**: [How component is affected by fix]
- **[Component 2]**: [How component is affected by fix]

## Deployment Notes

### Urgency

- [ ] Standard deployment schedule
- [ ] Expedited deployment recommended
- [ ] Hotfix deployment required

### Pre-deployment Checklist

- [ ] [Specific preparation step 1]
- [ ] [Specific preparation step 2]
- [ ] [Monitoring and alerting setup]

### Post-deployment Monitoring

- [Metric 1 to monitor for fix effectiveness]
- [Metric 2 to monitor for fix effectiveness]
- [Duration for enhanced monitoring]

---

**Fix Summary:**

- **Root Cause**: [Brief technical cause]
- **Solution**: [Brief technical solution]
- **Risk Level**: [Risk assessment]
- **Urgency**: [Deployment urgency level]
```

### Refactoring Template

```markdown
## Summary

Refactoring of [Component/Area] to improve [maintainability/performance/code quality] without changing external behavior.

## Refactoring Context

### Technical Debt Addressed

- **Issue 1**: [Technical debt description and impact]
- **Issue 2**: [Technical debt description and impact]
- **Issue 3**: [Technical debt description and impact]

### Motivation

- **Performance**: [Performance improvements expected]
- **Maintainability**: [Maintainability improvements achieved]
- **Code Quality**: [Quality improvements implemented]
- **Future Development**: [How changes enable future work]

## Changes Made

### Structural Improvements

- [Structural change 1 with technical reasoning]
- [Structural change 2 with technical reasoning]
- [Structural change 3 with technical reasoning]

### Code Organization

- **[Aspect 1]**: [How code organization was improved]
- **[Aspect 2]**: [How code organization was improved]

### Design Pattern Implementation

- [Pattern 1]: [How pattern improves code structure]
- [Pattern 2]: [How pattern improves code structure]

## Behavior Preservation

### No Functional Changes

- [ ] All existing functionality preserved exactly
- [ ] No changes to public APIs or interfaces
- [ ] No changes to data formats or protocols
- [ ] No changes to user-visible behavior

### Validation Strategy

- **Test Coverage**: [How existing tests validate behavior preservation]
- **Integration Testing**: [How integration behavior is validated]
- **Performance Testing**: [How performance impact is measured]

## Quality Improvements

### Code Metrics

- **Complexity**: Reduced from [X] to [Y]
- **Duplication**: Reduced from [X]% to [Y]%
- **Test Coverage**: Maintained at [X]% or improved to [Y]%

### Maintainability Gains

- [Improvement 1]: [Specific maintainability benefit]
- [Improvement 2]: [Specific maintainability benefit]
- [Improvement 3]: [Specific maintainability benefit]

## Testing Strategy

### Regression Testing

- [Test category 1]: [How existing behavior is validated]
- [Test category 2]: [How existing behavior is validated]
- [Test category 3]: [How existing behavior is validated]

### Performance Validation

- [Performance aspect 1]: [Measurement approach and results]
- [Performance aspect 2]: [Measurement approach and results]

## Review Focus

### Key Review Areas

- **Code Structure**: [Specific structural improvements to review]
- **Design Patterns**: [Pattern implementations to validate]
- **Performance Impact**: [Performance changes to assess]

### Validation Points

- [ ] No functional behavior changes introduced
- [ ] Code quality improvements achieved goals
- [ ] Performance impact acceptable or positive
- [ ] Future maintainability enhanced

---

**Refactoring Summary:**

- **Scope**: [Area and extent of refactoring]
- **Benefits**: [Key improvements achieved]
- **Risk**: [Risk level - should be low for pure refactoring]
- **Validation**: [How behavior preservation is ensured]
```

### Documentation Update Template

```markdown
## Summary

Documentation updates for [Component/Feature/Process] to improve [user experience/developer onboarding/API clarity].

## Documentation Changes

### New Documentation

- **[Doc Type 1]**: [Purpose and target audience]
- **[Doc Type 2]**: [Purpose and target audience]
- **[Doc Type 3]**: [Purpose and target audience]

### Updated Documentation

- **[Existing Doc 1]**: [What was updated and why]
- **[Existing Doc 2]**: [What was updated and why]
- **[Existing Doc 3]**: [What was updated and why]

### Documentation Structure

- [Organization improvement 1]
- [Organization improvement 2]
- [Navigation improvement 3]

## Content Improvements

### Accuracy Updates

- [Correction 1]: [What was inaccurate and how it's fixed]
- [Correction 2]: [What was inaccurate and how it's fixed]

### Clarity Enhancements

- [Enhancement 1]: [How clarity was improved]
- [Enhancement 2]: [How clarity was improved]

### Completeness Additions

- [Addition 1]: [What missing information was added]
- [Addition 2]: [What missing information was added]

## User Experience Impact

### Target Audiences

- **[Audience 1]**: [How documentation serves this group better]
- **[Audience 2]**: [How documentation serves this group better]

### Use Case Coverage

- [Use case 1]: [How documentation supports this scenario]
- [Use case 2]: [How documentation supports this scenario]

## Quality Validation

### Content Review

- [ ] Technical accuracy verified
- [ ] Grammar and style reviewed
- [ ] Links and references validated
- [ ] Code examples tested
- [ ] Screenshots updated if needed

### Format Validation

- [ ] Markdown syntax correct
- [ ] Consistent formatting applied
- [ ] Table of contents updated
- [ ] Cross-references working

## Deployment Considerations

### Documentation Site Updates

- [ ] Documentation builds successfully
- [ ] Search indexing updated
- [ ] Navigation menus reflect changes
- [ ] Version compatibility maintained

---

**Documentation Summary:**

- **Scope**: [Areas of documentation updated]
- **Improvements**: [Key enhancements made]
- **Impact**: [Expected user/developer benefit]
- **Quality**: [Validation approach used]
```

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- [Product vision, user personas, and requirements](../../product/adopted/PRD.md)
- [Development methodology and process definitions](../../way-of-working.md)
- [Commit and push completion status](./11-how-to-commit-and-push.md)
- `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` - Project Management Tool Guidelines

**Technical Context:**

- [System architecture patterns and design decisions](../../tech/adopted/architecture.md)
- [Technology choices and implementation standards](../../tech/adopted/tech-stack.md)
- [Infrastructure and deployment requirements](../../tech/adopted/infrastructure.md)
- [User interface patterns and interaction guidelines](../../tech/adopted/ux-ui.md)
- [Technical workflow and tool configuration](../../tech/adopted/way-of-working.md)

**Domain Context:**

- [Functional boundaries affecting pull request scope](../../product/adopted/subdomain/)
- [Technical boundaries affecting code review](../../tech/adopted/boundedcontext/)

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[01-architectural-guidelines.md](../../tech/knowledge-base/01-architectural-guidelines.md)** - System architecture patterns, bounded contexts, and ADR processes
- **[02-code-design-guidelines.md](../../tech/knowledge-base/02-code-design-guidelines.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[03-technical-guidelines.md](../../tech/knowledge-base/03-technical-guidelines.md)** - Tech stack, development tools, and feature flag management
- **[04-infrastructure-guidelines.md](../../tech/knowledge-base/04-infrastructure-guidelines.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[05-ux-guidelines.md](../../tech/knowledge-base/05-ux-guidelines.md)** - User experience standards and design principles
- **[06-definition-of-done.md](../../tech/knowledge-base/06-definition-of-done.md)** - Quality criteria and completion standards
- **[07-testing-strategy.md](../../tech/knowledge-base/07-testing-strategy.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[08-accessibility-guidelines.md](../../tech/knowledge-base/08-accessibility-guidelines.md)** - Accessibility standards and compliance requirements
- **[09-performance-guidelines.md](../../tech/knowledge-base/09-performance-guidelines.md)** - Performance optimization and monitoring strategies
- **[10-security-guidelines.md](../../tech/knowledge-base/10-security-guidelines.md)** - Security implementation and best practices
- **[11-observability-guidelines.md](../../tech/knowledge-base/11-observability-guidelines.md)** - Monitoring, logging, and tracing strategies

**Process Dependencies:**

- **Prerequisites**: Commit and push workflow completed following [How to Commit and Push](./11-how-to-commit-and-push.md)
- **Input**: Organized commit history with proper traceability pushed to remote repository
- **Output**: Comprehensive pull request ready for team code review with all necessary context and documentation
- **Next Phase**: Select Story ready for **How to Refine User Stories** process
- **Quality Gates**: All automated CI/CD validation, quality checks, and documentation requirements satisfied
- **Traceability**: Clear links maintained from pull request through commits to user stories, tasks, and acceptance criteria

## Related Documents

- Previous: [How to Commit and Push](11-how-to-commit-and-push.md)
- Next: [How to Create a Code Review](12-how-to-create-a-code-review.md)
