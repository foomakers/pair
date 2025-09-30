# How to Commit and Push - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively create meaningful commits and push code changes following established version control practices, team conventions, and TDD methodology. Commit and push operations transform **implemented task code** into versioned repository history that maintains clear traceability, supports automated workflows, and facilitates effective code review processes.

**Key Benefits of Structured Commit and Push Workflow:**

- Transform TDD implementation phases into clear commit history with atomic changes
- Ensure commit traceability from user stories through tasks to code changes
- Maintain consistency with established version control conventions and team standards
- Enable automated changelog generation and semantic release processes
- Facilitate effective code review through logical commit organization
- Support continuous integration through proper branch synchronization
- Provide clear development progress tracking through structured commit messages

**Important: Commits and pushes follow TDD-compliant workflow** - they represent the version control phase where TDD implementation phases become permanent repository history while maintaining traceability to requirements and architectural decisions.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer (Version Control Management)

The AI assistant acts as a **Product Software Engineer** who:

- **Analyzes** current git status and identifies completed TDD implementation work ready for commit
- **Identifies** user story and task context from branch naming conventions and implementation changes
- **Studies** user story specifications and task requirements to understand change context
- **Generates** structured commit messages following established conventions and TDD phase identification
- **Applies** atomic commit principles with clear change scope and purpose documentation
- **Manages** branch synchronization and remote repository integration workflows
- **Validates** pre-commit requirements and quality gates before repository updates
- **Maintains** clear commit history that supports code review and release management processes
- **Ensures** consistency with established version control standards and team conventions

**Working Principles**: Follow the **🤖🤝👨‍💻** model (AI generates commits, Developer approves) throughout the entire commit and push process.

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### **Filesystem Access Rules**

**✅ PERMITTED ONLY when:**

- Tool in [way-of-working.md](.pair/adoption/tech/way-of-working.md) = "filesystem"

**🚫 PROHIBITED when:**

- Any other tool is configured
- **DO NOT** read [.pair/adoption/product/backlog/](.pair/adoption/product/backlog/) directories
- **DO NOT** use filesystem as fallback

### **Validation Checklist**

- [ ] [way-of-working.md](.pair/adoption/tech/way-of-working.md) read and tool identified
- [ ] Tool configured (if not: halt and request bootstrap)
- [ ] [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) consulted for access procedures

## Commit and Push Definition

### What is Commit and Push in TDD Context?

A **Commit and Push Operation** is the **version control phase** where:

- **Transforms TDD Implementation**: Converts completed TDD phases (RED-GREEN-REFACTOR) into permanent version history
- **Follows Commit Conventions**: Adheres to established message formats with card references and change types
- **Maintains Atomic Changes**: Creates focused commits representing single logical changes with clear scope
- **Enables Traceability**: Links code changes back to user stories, tasks, and acceptance criteria
- **Supports Automation**: Provides structured history for automated changelog, release, and CI/CD processes
- **References Context**: Includes sufficient context for future maintainers and code review processes
- **Ensures Quality Gates**: Validates pre-commit requirements and maintains repository integrity

**Commit and push operations are systematic and traceable** - they follow established version control workflows while maintaining consistency with TDD methodology and architectural decisions.

### Commit Types and Context Integration

| Commit Type  | Context              | Purpose                                                       | Message Pattern                                                          |
| ------------ | -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **feat**     | TDD GREEN Phase      | Implement functionality to pass tests                         | `[STORY_CODE] feat: implement [task description]`                        |
| **test**     | TDD RED Phase        | Add failing tests for task requirements                       | `[STORY_CODE] test: add failing tests for [task description]`            |
| **refactor** | TDD REFACTOR Phase   | Improve code structure without behavior changes               | `[STORY_CODE] refactor: improve [aspect] for [task description]`         |
| **fix**      | Any Context          | Correct implementation bugs or issues                         | `[STORY_CODE] fix: correct [issue] in [component]`                       |
| **chore**    | Non-Code Tasks       | Update dependencies, tooling, configuration, or project setup | `[STORY_CODE] chore: update [component] for [reason]`                    |
| **docs**     | Documentation Tasks  | Add or update documentation, README files, or guides          | `[STORY_CODE] docs: document [component] or update [documentation area]` |
| **build**    | Infrastructure Tasks | Changes to build system, CI/CD, or deployment configuration   | `[STORY_CODE] build: configure [build aspect] for [purpose]`             |
| **ci**       | DevOps Tasks         | Changes to continuous integration configuration               | `[STORY_CODE] ci: setup [CI component] for [workflow]`                   |

## Prerequisites Verification

### Step 0: Git Status and Context Analysis

**AI Assistant Instructions:** Begin with comprehensive git and development context analysis:

**Phase 0A: Current Git Status Analysis**

1. **Analyze Git Working Directory**: Check current development state and changes:

   ```bash
   # Verify git status and staged/unstaged changes
   git status --porcelain
   git diff --name-only
   git diff --cached --name-only
   # Check current branch and tracking
   git branch --show-current
   git branch -vv
   ```

2. **Identify Implementation Progress**: Examine completed TDD work:

   - Review modified files and change scope
   - Analyze implementation completeness versus task requirements
   - Check for proper TDD phase separation in changes
   - Validate test coverage and implementation alignment

3. **Extract Story and Task Context**: From branch naming and implementation:

   ```bash
   # Extract story code from branch name
   BRANCH_NAME=$(git branch --show-current)
   # Parse story code pattern (e.g., feature/STORY-123-description)
   echo "Branch: $BRANCH_NAME"
   # Check recent commits for context
   git log --oneline -5
   ```

**Phase 0B: Task Type and Context Analysis**

4. **Identify Task Category**: Based on identified story code, determine implementation approach:

   **Code Implementation Tasks (TDD Required):**

   - Feature development with business logic
   - API endpoint implementation
   - Data access layer changes
   - User interface component development
   - Integration with external services

   **Non-Code Tasks (Simplified Workflow):**

   - Project setup and bootstrapping
   - Documentation updates and creation
   - Configuration file modifications
   - Build system and CI/CD setup
   - Dependency management and updates
   - Repository structure organization

   **Example Context Analysis:**
   _"Branch 'feature/US-123-project-setup' indicates User Story US-123 focusing on project bootstrapping. Based on git analysis, I can see changes in package.json, README.md, configuration files, and project structure. This appears to be a **non-code task** requiring simplified commit workflow without TDD methodology."_

5. **Select Appropriate Workflow**: Determine commit strategy based on task type:

   **TDD Workflow Selection** (for code implementation):

   - Load story and task context for TDD implementation
   - Plan RED-GREEN-REFACTOR cycle documentation
   - Prepare for comprehensive test coverage validation

   **Simplified Workflow Selection** (for non-code tasks):

   - Load story and task context for configuration/documentation changes
   - Plan logical grouping of related changes
   - Prepare for quality validation without test execution

6. **Map Changes to Task Requirements**: Connect implementation to specifications:

   **For Code Implementation Tasks:**

   - Match modified files to specific task requirements
   - Validate implementation completeness against task acceptance criteria
   - Identify which TDD phases are represented in current changes
   - Ensure all task specifications are addressed by implementation

   **For Non-Code Tasks:**

   - Match modified files to configuration or documentation requirements
   - Validate completeness against task specifications
   - Identify logical groupings of related changes
   - Ensure all setup or documentation requirements are addressed

**Phase 0C: Change Scope and Quality Validation**

6. **Validate Change Quality**: Before commit preparation:

   ```bash
   # Run tests to ensure implementation quality
   pnpm test  # or appropriate test command
   # Check linting and code quality
   pnpm run lint  # or appropriate linting command
   # Validate build if applicable
   pnpm run build  # or appropriate build command
   ```

7. **Analyze Commit Readiness**: Determine if changes are ready for commit:

   **Ready for Commit:**

   - All tests passing with proper TDD phase completion
   - Code quality validation passes (linting, formatting)
   - Implementation addresses specific task requirements completely
   - Changes represent logical, atomic scope for single commit

   **Not Ready for Commit:**

   - Tests failing or incomplete TDD phase execution
   - Code quality issues requiring resolution
   - Mixed concerns requiring atomic commit separation
   - Missing implementation for task requirements

## Simplified Workflow for Non-Code Tasks

### When to Use Simplified Workflow

**Non-Code Task Categories:**

- **Project Bootstrapping**: Initial project setup, folder structure, base configuration files
- **Documentation Tasks**: README updates, API documentation, architectural documentation, user guides
- **Configuration Management**: Environment configuration, build scripts, CI/CD setup, dependency updates
- **Repository Organization**: File structure changes, .gitignore updates, template files
- **Infrastructure Setup**: Docker files, deployment scripts, environment variables
- **Tool Configuration**: Linter configs, formatter settings, editor configurations

### Simplified Workflow Process

**Step S1: Non-Code Change Analysis**

**AI Assistant Instructions:** Analyze non-code changes with focus on configuration and documentation completeness:

1. **Comprehensive Non-Code Change Analysis**: Examine all modifications:

   _"Analyzing current changes for User Story [STORY_CODE]: [STORY_NAME]. I've identified the following non-code modifications ready for commit:_

   **Modified Files Analysis:**

   - `[config_file]`: [Description of configuration changes and purpose]
   - `[documentation_file]`: [Description of documentation updates]
   - `[project_structure]`: [Description of organizational changes]

   **Task Category Identification:**

   - Changes represent: [Project setup/Documentation/Configuration] tasks
   - Task coverage: [specific task IDs addressed]
   - Acceptance criteria addressed: [AC references]

   **Change Scope Validation:**

   - Changes are atomic and represent single logical setup/documentation purpose
   - All related configuration files included in scope
   - Documentation follows established formatting and style guidelines
   - Quality gates satisfied for non-code commit readiness"\_

**Step S2: Simplified Commit Message Generation**

2. **Generate Non-Code Commit Messages**: Following established conventions with appropriate types:

   **Project Setup Commit:**

   ```
   [STORY_CODE] chore: initialize project structure and base configuration

   - Created initial folder structure following architectural guidelines
   - Added base configuration files for development environment
   - Set up package.json with essential dependencies and scripts
   - Configured linting and formatting tools for code quality

   Related to Task: [TASK_ID]
   Addresses AC: [Acceptance criteria reference]
   Setup Phase: Complete project foundation ready for development
   ```

   **Documentation Update Commit:**

   ```
   [STORY_CODE] docs: update API documentation for user authentication

   - Added comprehensive endpoint documentation with examples
   - Updated authentication flow diagrams and user guides
   - Included error handling documentation and troubleshooting
   - Enhanced README with setup and configuration instructions

   Related to Task: [TASK_ID]
   Addresses AC: [Acceptance criteria reference]
   Documentation: Complete user and developer guide updates
   ```

   **Configuration Management Commit:**

   ```
   [STORY_CODE] build: configure CI/CD pipeline for automated testing

   - Set up GitHub Actions workflow for automated test execution
   - Configured deployment pipeline with environment-specific builds
   - Added quality gates for code coverage and security scanning
   - Integrated dependency update automation and vulnerability checks

   Related to Task: [TASK_ID]
   Addresses AC: [Acceptance criteria reference]
   Infrastructure: Complete CI/CD automation setup
   ```

**Step S3: Simplified Quality Validation**

3. **Non-Code Quality Validation**: Ensure changes meet standards without test execution:

   **Configuration Validation:**

   ```bash
   # Validate JSON/YAML configuration syntax
   pnpm run lint:config  # if available
   # Check build process with new configuration
   pnpm run build
   # Validate environment setup if applicable
   pnpm run setup:validate  # if available
   ```

   **Documentation Validation:**

   ```bash
   # Check documentation formatting and links
   pnpm run lint:docs  # if available
   # Generate documentation to verify completeness
   pnpm run docs:build  # if available
   # Validate markdown syntax and formatting
   markdownlint *.md  # if tool available
   ```

   **Quality Gate Results (Non-Code):**

   - ✅ Configuration syntax validation successful
   - ✅ Documentation formatting and links verified
   - ✅ Build process works with configuration changes
   - ✅ Repository structure follows established conventions

**Step S4: Simplified Commit Execution**

4. **Execute Non-Code Commits**: Following atomic principles without TDD complexity:

   **Single Commit for Complete Setup:**

   ```bash
   # Stage all related configuration and documentation files
   git add [config_files] [documentation_files] [structure_files]
   # Verify staged changes align with commit scope
   git diff --cached --name-only
   # Execute commit with approved message
   git commit -F - << 'EOF'
   [APPROVED_COMMIT_MESSAGE]
   EOF
   ```

   **Multiple Commits for Logical Separation:**

   ```bash
   # Commit 1: Project structure and base configuration
   git add [structure_files] [base_config_files]
   git commit -m "[STORY_CODE] chore: initialize project structure..."

   # Commit 2: Documentation updates
   git add [documentation_files]
   git commit -m "[STORY_CODE] docs: update documentation..."

   # Commit 3: CI/CD and build configuration
   git add [build_config_files] [ci_files]
   git commit -m "[STORY_CODE] build: configure CI/CD pipeline..."
   ```

**Step S5: Simplified Push and Completion**

5. **Complete Non-Code Task Workflow**: Finish with simplified validation:

   ```bash
   # Final validation after all commits
   pnpm run build  # ensure build still works
   pnpm run lint   # validate any linting rules
   # Push to remote repository
   git push origin $(git branch --show-current)
   ```

   **Non-Code Completion Confirmation:**
   _"Non-code task implementation completed successfully:_

   - _Configuration changes committed with proper validation_
   - _Documentation updates committed with formatting verification_
   - _Build and quality processes validated with new changes_
   - _Repository structure follows established conventions_

   _User Story [STORY_CODE] non-code tasks are complete and ready for code review process."_

### Step 1: Change Analysis and Commit Preparation

**AI Assistant Instructions:** Analyze changes and prepare structured commit approach:

1. **Comprehensive Change Analysis**: Examine all modifications in context:

   **For Code Implementation Tasks:**
   _"Analyzing current changes for User Story [STORY_CODE]: [STORY_NAME]. I've identified the following modifications ready for commit:_

   **Modified Files Analysis:**

   - `[implementation_file]`: [Description of code changes and business purpose]
   - `[test_file]`: [Description of test coverage and validation changes]
   - `[config_files]`: [Description of supporting configuration changes]

   **TDD Phase Identification:**

   - Changes represent: [RED/GREEN/REFACTOR] phase completion
   - Task coverage: [specific task IDs addressed]
   - Acceptance criteria addressed: [AC references]

   **Change Scope Validation:**

   - Changes are atomic and represent single logical purpose
   - All related test coverage included in scope
   - Implementation follows established architectural patterns
   - Quality gates satisfied for commit readiness"\_

   **For Non-Code Tasks:**
   _"Analyzing current changes for User Story [STORY_CODE]: [STORY_NAME]. I've identified the following non-code modifications ready for commit:_

   **Modified Files Analysis:**

   - `[config_file]`: [Description of configuration changes and setup purpose]
   - `[documentation_file]`: [Description of documentation updates and improvements]
   - `[structure_files]`: [Description of project organization changes]

   **Task Category Identification:**

   - Changes represent: [Setup/Documentation/Configuration] completion
   - Task coverage: [specific task IDs addressed]
   - Acceptance criteria addressed: [AC references]

   **Change Scope Validation:**

   - Changes are atomic and represent single logical setup purpose
   - All related configuration and documentation included
   - Setup follows established project conventions
   - Quality gates satisfied for non-code commit readiness"\_

2. **Determine Commit Strategy**: Based on change analysis and task type, propose approach:

   **Single Atomic Commit for Code Implementation:**
   _"All current changes represent a cohesive TDD implementation of [task description] and can be committed as a single atomic change with proper TDD phase documentation."_

   **Single Atomic Commit for Non-Code Tasks:**
   _"All current changes represent a cohesive configuration/documentation update for [task description] and can be committed as a single atomic change with proper setup phase documentation."_

   **Multiple Atomic Commits (for mixed concerns):**
   _"Current changes include multiple concerns that should be separated into atomic commits:_

   - _Commit 1: [specific scope and files - e.g., "Configuration setup"]_
   - _Commit 2: [specific scope and files - e.g., "Documentation updates"]_
   - _Commit 3: [specific scope and files - e.g., "Feature implementation"]_

   _This approach maintains clear commit history and supports effective code review."_

3. **Generate Commit Message(s)**: Following established conventions:

   **Commit Message Structure Applied:**

   ```
   [STORY_CODE] [type]: [imperative description under 72 chars]

   [Optional body explaining WHY the change was made]
   - [Specific implementation detail]
   - [Business logic explanation]
   - [Technical decision rationale]

   [Optional footer with breaking changes or references]
   Related to Task: [TASK_ID]
   Addresses AC: [Acceptance Criteria reference]
   ```

### Step 2: Commit Message Generation and Approval

**AI Assistant Instructions:** Generate structured commit messages following established conventions:

1. **Generate Primary Commit Message**: Based on change analysis and story context:

   **Example Generated Message:**

   ```
   US-123 feat: implement user password validation with strength checking

   - Added password complexity validation following security guidelines
   - Implemented strength meter calculation with real-time feedback
   - Added comprehensive test coverage for edge cases and error conditions
   - Integrated with existing authentication service architecture

   Related to Task: TSK-123-02
   Addresses AC: Users must receive immediate feedback on password strength
   TDD Phase: GREEN - Implementation to pass comprehensive test suite
   ```

2. **Present Message for Developer Approval**: Request confirmation before commit:

   _"I've generated the following commit message based on the implemented changes and story context:_

   [**Generated commit message displayed**]

   _This commit message:_

   - _Follows our established convention with story code [STORY_CODE]_
   - _Uses proper commit type '[type]' for the TDD phase and change nature_
   - _Includes imperative description under 72 characters_
   - _Provides context explaining WHY these changes were made_
   - _References specific task and acceptance criteria for traceability_
   - _Documents TDD phase completion for development history_

   _Please review and approve this commit message, or let me know if you'd like any modifications to better reflect the implementation context."_

3. **Handle Developer Feedback**: Process approval or modification requests:

   **If Approved:**

   - Proceed with commit execution using approved message
   - Maintain exact message formatting and structure
   - Execute commit with proper git staging

   **If Modifications Requested:**

   - Apply requested changes to message structure or content
   - Validate modified message still follows conventions
   - Re-present for approval before commit execution

### Step 3: Atomic Commit Execution

**AI Assistant Instructions:** Execute commits following atomic principles and TDD methodology:

1. **Stage Changes for Atomic Commit**: Prepare specific file staging:

   **Single Atomic Commit Staging:**

   ```bash
   # Stage all related changes for single commit
   git add [implementation_files] [test_files] [config_files]
   # Verify staged changes align with commit scope
   git diff --cached --name-only
   ```

   **Multiple Atomic Commits Staging:**

   ```bash
   # Stage first atomic commit scope
   git add [specific_files_for_commit_1]
   # Verify staging matches intended commit scope
   git diff --cached --name-only
   # Execute first commit, then repeat for subsequent commits
   ```

2. **Execute Commit with Approved Message**: Create commit with validated message:

   ```bash
   # Execute commit using approved message
   git commit -F - << 'EOF'
   [APPROVED_COMMIT_MESSAGE]
   EOF
   ```

   **Commit Execution Confirmation:**
   _"Commit executed successfully using approved message. Commit hash: [COMMIT_HASH]. The changes are now permanently recorded in the repository history with proper traceability to User Story [STORY_CODE] and Task [TASK_ID]."_

3. **Validate Commit Result**: Verify successful commit creation:

   ```bash
   # Verify commit was created correctly
   git log --oneline -1
   git show --stat HEAD
   # Check repository status after commit
   git status
   ```

**Multiple Commit Execution**: If multiple atomic commits required:

_"Executing atomic commit sequence for comprehensive change set:_

**Commit 1/3 Completed:** [COMMIT_HASH_1] - [Brief description]
**Commit 2/3 Completed:** [COMMIT_HASH_2] - [Brief description]  
 **Commit 3/3 Completed:** [COMMIT_HASH_3] - [Brief description]

_All atomic commits executed successfully. Complete change set now committed with proper TDD phase documentation and story traceability."_

### Step 4: Pre-Push Validation and Remote Synchronization

**AI Assistant Instructions:** Validate commit readiness and prepare for remote push:

1. **Pre-Push Quality Validation**: Ensure commit meets quality gates:

   ```bash
   # Validate tests still pass after commit
   pnpm test
   # Check code quality after commit
   pnpm run lint
   # Validate build integrity
   pnpm run build
   ```

   **Quality Gate Results:**

   - ✅ All tests passing (TDD integrity maintained)
   - ✅ Code quality validation successful
   - ✅ Build process completes without errors
   - ✅ Commit represents stable, reviewable state

2. **Check Remote Synchronization Status**: Analyze branch relationship:

   ```bash
   # Check if branch is ahead/behind remote
   git status -uno
   git log --oneline origin/$(git branch --show-current)..HEAD
   # Check for potential conflicts
   git fetch origin
   git status -uno
   ```

3. **Present Push Recommendation**: Based on validation results:

   _"Commit validation completed successfully. Repository is now in stable state with:_

   - _[X] commits ahead of remote origin_
   - _All quality gates passing_
   - _No merge conflicts detected_
   - _TDD implementation properly committed with [RED/GREEN/REFACTOR] phase documentation_

   _The code is ready for push to remote repository to enable code review process. Would you like me to proceed with pushing the committed changes to remote repository?"_

### Step 5: Remote Push Execution and Branch Synchronization

**AI Assistant Instructions:** Handle remote push and branch synchronization based on developer approval:

1. **Execute Remote Push**: Upon developer confirmation:

   ```bash
   # Push committed changes to remote branch
   git push origin $(git branch --show-current)
   # Verify push success
   git status -uno
   ```

   **Push Execution Confirmation:**
   _"Successfully pushed commits to remote repository. Branch '[BRANCH_NAME]' is now synchronized with remote origin. The TDD implementation for User Story [STORY_CODE] is now available in the remote repository for code review process."_

2. **Handle Push Conflicts**: If conflicts occur during push:

   **Conflict Detection and Resolution:**

   ```bash
   # If push rejected due to remote changes
   git fetch origin
   git rebase origin/$(git branch --show-current)
   # Resolve conflicts if any
   # Re-run tests after rebase
   pnpm test
   ```

   **Conflict Resolution Process:**
   _"Push operation detected conflicts with remote changes. Initiating conflict resolution:_

   - _Fetched latest remote changes_
   - _Rebasing local commits on top of remote changes_
   - _[IF CONFLICTS]: Manual conflict resolution required in: [conflicted_files]_
   - _Re-validating tests and quality gates after conflict resolution_
   - _Will re-attempt push after successful conflict resolution"_

3. **Post-Push Validation**: Confirm successful synchronization:

   ```bash
   # Verify remote synchronization
   git log --oneline -5
   git branch -vv
   # Check CI/CD trigger if applicable
   ```

   **Synchronization Confirmation:**
   _"Remote synchronization completed successfully:_

   - _Local branch synchronized with remote origin_
   - _All commits pushed with proper message formatting_
   - _CI/CD pipelines triggered (if configured)_
   - _Branch ready for code review process initiation_

   _User Story [STORY_CODE] TDD implementation is now available for team review and validation."_

### Step 6: Post-Push Status Update and Handoff Preparation

**AI Assistant Instructions:** Update project status and prepare for next workflow phase:

1. **Update Project Management System**: Reflect commit and push completion:

   - Update task status to "Implementation Committed" with commit references
   - Add or link commit hash documentation to task completion records
   - Update story progress with implementation completion indicators
   - Maintain traceability from tasks through commits to remote repository
   - Ensure epic progress reflects committed implementation work

2. **Prepare Code Review Handoff**: Set up transition to review process:

   **Code Review Preparation Checklist:**

   - ✅ All TDD phases committed with proper documentation
   - ✅ Commit messages follow established conventions with story traceability
   - ✅ Remote branch synchronized and available for review
   - ✅ Quality gates validated and passing
   - ✅ Project management status accurately reflects implementation completion
   - ✅ Clear commit history supports effective code review

3. **Generate Implementation Summary**: Document completed work:

   **Commit and Push Summary:**
   _"User Story [STORY_CODE]: [STORY_NAME] implementation has been successfully committed and pushed to remote repository:_

   **Commit History:**

   - _[COMMIT_HASH_1]: [Commit message summary]_
   - _[COMMIT_HASH_2]: [Commit message summary]_
   - _[Continue for all commits]_

   **TDD Documentation:**

   - _All RED-GREEN-REFACTOR cycles properly documented in commit history_
   - _Test coverage committed with corresponding implementation_
   - _Code structure improvements captured in refactor commits_

   **Branch Status:**

   - _Branch: [BRANCH_NAME] synchronized with remote origin_
   - _Ready for code review process initiation_
   - _No merge conflicts or synchronization issues_

   _The implementation is complete and ready for '[How to Code Review](13-how-to-code-review.md)' process."_

## Squash Strategy for Pull Request Preparation

### Pre-Pull Request Commit Organization

**AI Assistant Instructions:** Before pull request creation, organize commit history through squashing:

**Important: Squash Timing**

- Squashing occurs **before** pull request creation, not after implementation
- All TDD implementation commits should be squashed into logical story-level commits
- Maintain traceability to original detailed TDD commit history if needed

### Squash Decision Matrix

| Scenario              | Squash Strategy                        | Commit Result                 |
| --------------------- | -------------------------------------- | ----------------------------- |
| **Single Task Story** | Squash all TDD commits                 | One commit per story          |
| **Multi-Task Story**  | Squash per task, maintain task commits | One commit per completed task |
| **Complex Feature**   | Logical grouping squash                | Commits by functional area    |
| **Bug Fix**           | Full squash                            | Single bug fix commit         |

### Step 7: Pre-Pull Request Squash Execution

**AI Assistant Instructions:** Execute commit squashing before pull request preparation:

1. **Analyze Commit History for Squashing**: Review commits to organize:

   ```bash
   # Review commit history on branch
   git log --oneline origin/main..HEAD
   # Count commits to squash
   COMMIT_COUNT=$(git rev-list --count origin/main..HEAD)
   echo "Commits to organize: $COMMIT_COUNT"
   ```

2. **Verify Existing Squash Strategy**: Check adopted team standards first:

   **Check Adopted Way of Working:**
   _"Before proposing a squash strategy, I'm checking the team's adopted way-of-working file at `./tech/adopted/way-of-working.md` for established squash conventions..."_

   **If Strategy Found in Adoptions:**
   _"Found existing squash strategy in team adoptions: [EXISTING_STRATEGY_DESCRIPTION]. Applying this established approach for consistency with team standards."_

   **If No Strategy Found in Adoptions:**
   _"No specific squash strategy found in team adoptions. Based on current story and task structure, I'll recommend an appropriate approach."_

3. **Determine Squash Strategy**: Based on adoptions and story structure:

   _"Analyzing commit history for User Story [STORY_CODE] before pull request creation:_

   **Current Commits:**

   - _[COMMIT_COUNT] total commits with detailed TDD phase documentation_
   - _[Task breakdown showing which commits address which tasks]_

   **Recommended Squash Strategy:**
   _[If using adopted strategy]: Following team's adopted strategy: [STRATEGY_DESCRIPTION]_
   _[If proposing new strategy]: Based on story complexity, recommending: [APPROACH_DESCRIPTION]_

   **Squashed Commit Plan:**

   - _Final Commit 1: [Scope and message for squashed commit]_
   - _Final Commit 2: [If multiple commits needed after squash]_

   _This will create clean, reviewable commit history while maintaining story traceability._

   **Strategy Questions:**
   _[If using adopted strategy]: Proceed with established team squash strategy?_
   _[If proposing new strategy]: Would you like to use this strategy just for this commit, or should I add it to the team's adopted way-of-working file for future consistency?"_

4. **Handle Strategy Adoption Decision**: Based on developer response:

   **If Using Strategy for This Commit Only:**

   - Proceed with squash operation using recommended strategy
   - Document decision for current commit only
   - Continue with existing adoptions unchanged

   **If Adding Strategy to Adoptions:**

   - Generate proposed addition to `./tech/adopted/way-of-working.md`
   - Present modification for developer approval
   - Update adoptions file after approval
   - Proceed with squash operation using newly adopted strategy

   **Example Adoption Addition:**

   ```markdown
   ### Git Commit Squash Strategy

   **Pre-Pull Request Squashing:**

   - **Single Task Stories**: Squash all TDD commits into one story commit
   - **Multi-Task Stories**: One commit per completed task (preserve task boundaries)
   - **Complex Features**: Logical functional groupings (e.g., backend/frontend/config)
   - **Bug Fixes**: Full squash into single descriptive commit

   **Squash Timing**: Always before pull request creation, never after merge
   **History Preservation**: Original detailed commits available in branch history before squash
   ```

   _"I've generated the addition to way-of-working.md above. If you approve this addition, I'll update the adoptions file and then proceed with the squash using this new standard. This will ensure future commits follow the same consistent approach."_

5. **Execute Interactive Squash**: Perform commit organization:

   ```bash
   # Interactive rebase for commit squashing
   git rebase -i origin/main
   # Or specific commit count if needed
   git rebase -i HEAD~$COMMIT_COUNT
   ```

   **Squash Message Generation:**

   ```
   [STORY_CODE] feat: implement [story functionality summary]

   Complete implementation including:
   - [Task 1 summary with key functionality]
   - [Task 2 summary with key functionality]
   - [Task 3 summary with key functionality]
   - Comprehensive test coverage following TDD methodology
   - Integration with existing [architectural components]

   Addresses acceptance criteria:
   - AC-1: [Brief description of coverage]
   - AC-2: [Brief description of coverage]

   Related to Epic: [EPIC_ID]
   TDD Implementation: Complete RED-GREEN-REFACTOR cycles for all tasks
   ```

6. **Update Adoptions File (if requested)**: Add strategy to team standards:

   ```bash
   # Update way-of-working.md with approved squash strategy
   # Add the approved section to ./tech/adopted/way-of-working.md
   git add ./tech/adopted/way-of-working.md
   git commit -m "[STORY_CODE] docs: add git squash strategy to team adoptions"
   ```

   **Adoptions Update Confirmation:**
   _"Successfully added git squash strategy to team adoptions at `./tech/adopted/way-of-working.md`. This strategy will now be used consistently for future commits across the team. Proceeding with squash operation using newly adopted standard."_

7. **Validate Squash Result**: Ensure proper history organization:

   ```bash
   # Verify squashed commit history
   git log --oneline origin/main..HEAD
   # Verify all changes preserved
   git diff origin/main..HEAD --stat
   # Re-run quality validation
   pnpm test && pnpm run lint
   ```

   **Squash Completion Confirmation:**
   _"Commit squashing completed successfully using [adopted/new] team strategy. Story implementation now organized as [X] clean commits ready for pull request:_

   - _All TDD implementation work preserved in squashed commits_
   - _Clear commit messages with story and task traceability_
   - _Quality gates still passing after squash operation_
   - _[If adoptions updated]: Team squash strategy now documented in adoptions_
   - _Branch ready for pull request creation process_

   _The implementation history is now optimized for effective code review following established team standards."_

## Quality Assurance Framework

### Commit Message Quality Standards

**Message Structure Compliance:**

- [ ] **Story Code Reference**: All commits include proper story/card ID formatting
- [ ] **Commit Type Prefix**: Appropriate type prefix (feat, fix, refactor, test, chore, docs)
- [ ] **Imperative Mood**: Subject line written in command form ("Add" not "Added")
- [ ] **Character Limits**: Subject line under 72 characters, body wrapped at 72 characters
- [ ] **Capitalization**: Subject line properly capitalized, no period at end
- [ ] **Context Documentation**: Body explains WHY changes were made, not just WHAT
- [ ] **Traceability Links**: References to tasks, acceptance criteria, and epic connections
- [ ] **TDD Phase Documentation**: Clear identification of RED/GREEN/REFACTOR phase completion

**Atomic Commit Principles:**

- [ ] **Single Purpose**: Each commit addresses one logical change or complete TDD phase
- [ ] **Complete Scope**: All files necessary for change included in single commit
- [ ] **Buildable State**: Each commit leaves codebase in working, testable state
- [ ] **Test Alignment**: Implementation commits include corresponding test changes
- [ ] **Dependency Consistency**: Version changes and dependency updates properly grouped
- [ ] **Configuration Coherence**: Related configuration changes committed together
- [ ] **Documentation Updates**: Code changes accompanied by relevant documentation updates

### Pre-Push Quality Gates

**Technical Quality Validation:**

- [ ] **Test Suite Passing**: All automated tests pass before push operation
- [ ] **Code Quality Standards**: Linting and formatting validation successful
- [ ] **Build Integrity**: Application builds successfully without errors or warnings
- [ ] **TDD Compliance**: Implementation follows proper RED-GREEN-REFACTOR methodology
- [ ] **Version Consistency**: All dependencies maintain consistent versions across workspaces
- [ ] **Security Validation**: No security vulnerabilities introduced by changes
- [ ] **Performance Impact**: No significant performance degradation from changes
- [ ] **Integration Testing**: Changes work correctly with existing system components

### Quality Assurance for Non-Code Tasks

**Non-Code Quality Standards:**

- [ ] **Configuration Validation**: All configuration files have valid syntax and structure
- [ ] **Documentation Standards**: Documentation follows established formatting, style, and content guidelines
- [ ] **Link Verification**: All internal and external links in documentation are functional
- [ ] **Build Compatibility**: Configuration changes don't break existing build or deployment processes
- [ ] **Environment Consistency**: Configuration works across all required environments (dev/staging/prod)
- [ ] **Tool Integration**: New tools and configurations integrate properly with existing workflow

**Process Compliance Validation:**

- [ ] **Branch Synchronization**: Local branch properly synchronized with remote origin
- [ ] **Conflict Resolution**: Any merge conflicts resolved completely and validated
- [ ] **Project Status Updates**: Task and story status accurately reflect committed work
- [ ] **Documentation Currency**: Implementation documentation updated for changes
- [ ] **Standards Adherence**: Code follows established architectural and coding guidelines
- [ ] **Review Readiness**: Commits organized appropriately for effective code review
- [ ] **Traceability Maintenance**: Clear links from commits to requirements and design decisions
- [ ] **Quality Gate History**: All pre-commit validations documented and passing

**Process Compliance for Non-Code:**

- [ ] **Setup Completeness**: All required configuration files and documentation created
- [ ] **Structural Standards**: Project organization follows established conventions and guidelines
- [ ] **Documentation Coverage**: All necessary user and developer documentation provided
- [ ] **Quality Tool Configuration**: Linting, formatting, and quality tools properly configured
- [ ] **CI/CD Integration**: Automated workflows configured and tested for new setup
- [ ] **Repository Standards**: .gitignore, README, and repository structure follow team conventions
- [ ] **Dependency Management**: Package files properly configured with appropriate dependency versions
- [ ] **Environment Variables**: Required environment variables documented and configured appropriately

## Best Practices for AI Assistants

### Commit and Push Do's:

- **Always analyze git status and branch context** before generating any commit messages
- **Study user story and task specifications** to understand business context for changes
- **Check adopted way-of-working for squash strategy** before proposing commit organization approach
- **Generate commit messages following established conventions** with proper story code references
- **Request developer approval** for all generated commit messages before execution
- **Maintain atomic commit principles** with single logical purpose per commit
- **Document TDD phase completion** clearly in commit messages with phase identification
- **Validate quality gates** before any push operations to remote repository
- **Provide clear traceability** from commits back to requirements and acceptance criteria
- **Organize commit history appropriately** through squashing before pull request creation
- **Update project management status** accurately to reflect committed implementation work
- **Offer to update team adoptions** when proposing new squash strategies for consistency

### Commit and Push Don'ts:

**General Don'ts:**

- **Never commit without analyzing story context** and understanding change implications
- **Don't generate vague commit messages** without specific purpose and context documentation
- **Never commit mixed concerns** in single commit - maintain atomic change principles
- **Don't push without quality validation** - ensure tests pass and code quality maintained
- **Never skip developer approval** for generated commit messages or push operations
- **Don't ignore merge conflicts** - resolve completely and validate before continuing
- **Never commit breaking changes** without proper documentation and team communication
- **Don't skip project status updates** after successful commit and push operations
- **Never bypass established conventions** for commit formatting and message structure
- **Don't leave uncommitted changes** when story implementation is considered complete
- **Never propose squash strategies without checking adoptions** - always verify team standards first
- **Don't miss opportunities to improve team standards** - offer to update adoptions when proposing better approaches

**TDD-Specific Don'ts:**

- **Never skip TDD phase documentation** in commit messages for code implementation
- **Don't mix TDD phases** in single commit - maintain clear phase separation
- **Never commit code without corresponding tests** when following TDD methodology

**Non-Code Specific Don'ts:**

- **Don't commit invalid configuration** without syntax and compatibility validation
- **Never skip documentation verification** - ensure formatting and links work correctly
- **Don't mix setup concerns** - separate configuration, documentation, and infrastructure changes appropriately
- **Never commit incomplete setup** - ensure all required configuration and documentation is complete

## Common Pitfalls and Solutions

| Pitfall                                      | Impact                                           | Solution                                                          |
| -------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| **Vague commit messages without context**    | Poor traceability and difficult code review      | Always include story context and explain WHY changes made         |
| **Mixed concerns in single commit**          | Difficult rollback and unclear change scope      | Separate unrelated changes into atomic commits                    |
| **Missing story/task references**            | Lost traceability to requirements                | Always include story code and task references in messages         |
| **Committing without quality validation**    | Broken build states and failing CI/CD            | Run tests and quality checks before every commit                  |
| **Push conflicts without proper resolution** | Repository inconsistency and merge issues        | Fetch, rebase, resolve conflicts, re-validate before push         |
| **Skipping TDD phase documentation**         | Lost implementation methodology history          | Document TDD phase completion in every relevant commit            |
| **Improper commit squashing timing**         | Complex merge conflicts in pull requests         | Squash commits before pull request creation, not after            |
| **Missing project status updates**           | Inconsistent project tracking and progress       | Update task/story status immediately after successful push        |
| **Ignoring branch synchronization**          | Merge conflicts and integration issues           | Regularly sync with remote and resolve conflicts promptly         |
| **Poor commit organization for review**      | Difficult code review and approval process       | Organize commits logically before pull request creation           |
| **Not checking adopted squash strategy**     | Inconsistent commit organization across team     | Always verify team adoptions before proposing squash approach     |
| **Missing adoption update opportunities**    | Team standards stagnation and inconsistency      | Offer to update adoptions when proposing improved approaches      |
| **Invalid configuration commits**            | Build failures and deployment issues             | Validate configuration syntax and compatibility before commit     |
| **Incomplete documentation updates**         | Poor user/developer experience and confusion     | Ensure all documentation is complete, formatted, and links work   |
| **Mixed non-code concerns in commits**       | Unclear change scope for setup/config            | Separate configuration, documentation, and infrastructure changes |
| **Committing without setup validation**      | Broken development environment setup             | Test configuration and setup processes before commit              |
| **Missing non-code quality validation**      | Poor project foundation and developer experience | Validate build compatibility and documentation completeness       |

## Commit Message Templates

### TDD Phase Commit Templates

**RED Phase (Test Writing):**

```
[STORY_CODE] test: add failing tests for [specific functionality]

- Added test scenarios for [happy path behavior]
- Added edge case validation for [specific edge cases]
- Added error condition testing for [error scenarios]
- All tests failing as expected before implementation

Related to Task: [TASK_ID]
TDD Phase: RED - Comprehensive test coverage before implementation
```

**GREEN Phase (Implementation):**

```
[STORY_CODE] feat: implement [specific functionality]

- Implemented core logic for [main functionality]
- Added input validation and error handling
- Integrated with existing [architectural component]
- All tests now passing with minimal implementation

Related to Task: [TASK_ID]
Addresses AC: [Acceptance criteria reference]
TDD Phase: GREEN - Minimal implementation to satisfy test requirements
```

**REFACTOR Phase (Code Improvement):**

```
[STORY_CODE] refactor: improve [code structure aspect] for [functionality]

- Extracted reusable utilities for better code organization
- Enhanced error handling with consistent patterns
- Improved naming and documentation for maintainability
- All tests remain passing throughout refactoring

Related to Task: [TASK_ID]
TDD Phase: REFACTOR - Structure improvements without behavior changes
```

### Non-Code Commit Message Templates

**Project Setup and Bootstrapping:**

```
[STORY_CODE] chore: initialize [project/component] structure and configuration

- Created initial folder structure following architectural guidelines
- Added base configuration files for [development/production] environment
- Set up [package.json/build.gradle/requirements.txt] with essential dependencies
- Configured [linting/formatting/quality] tools for code standards
- Added [docker/CI/deployment] configuration for infrastructure setup

Related to Task: [TASK_ID]
Addresses AC: [Acceptance criteria reference]
Setup Phase: Complete [project/component] foundation ready for development
```

**Documentation Updates:**

```
[STORY_CODE] docs: update [API/user/developer] documentation for [feature area]

- Added comprehensive [endpoint/feature/component] documentation with examples
- Updated [workflow/architecture/setup] diagrams and user guides
- Included [error handling/troubleshooting/FAQ] documentation
- Enhanced [README/wiki/guides] with [setup/usage/configuration] instructions
- Fixed [broken links/outdated information/formatting issues]

Related to Task: [TASK_ID]
Addresses AC: [Acceptance criteria reference]
Documentation: Complete [user/developer/API] guide updates
```

**Configuration and Infrastructure:**

```
[STORY_CODE] build: configure [CI/CD/deployment] pipeline for [purpose]

- Set up [GitHub Actions/Jenkins/Azure DevOps] workflow for [automated testing/deployment]
- Configured [deployment/build/quality] pipeline with environment-specific settings
- Added quality gates for [code coverage/security scanning/performance testing]
- Integrated [dependency updates/vulnerability checks/automated releases]
- Updated [environment variables/secrets/configuration] management

Related to Task: [TASK_ID]
Addresses AC: [Acceptance criteria reference]
Infrastructure: Complete [CI/CD/deployment] automation setup
```

**Dependency and Tool Updates:**

```
[STORY_CODE] chore: update [dependencies/tools] for [security/compatibility/features]

- Updated [framework/library] from [old_version] to [new_version]
- Resolved [security vulnerabilities/compatibility issues] in dependencies
- Added new [development/build/testing] tools for [improved workflow/quality]
- Updated [configuration/scripts] to work with new dependency versions
- Verified [build/test/deployment] processes work with updated dependencies

Related to Task: [TASK_ID]
Addresses AC: [Acceptance criteria reference]
Maintenance: [Security/compatibility/feature] improvements through dependency updates
```

**Complete Story Implementation:**

```
[STORY_CODE] feat: implement [complete story functionality]

Complete implementation including:
- [Task 1]: [Key functionality summary]
- [Task 2]: [Key functionality summary]
- [Task 3]: [Key functionality summary]
- Comprehensive test coverage with TDD methodology
- Integration with [existing architectural components]

Addresses all acceptance criteria:
- AC-1: [Brief description of how addressed]
- AC-2: [Brief description of how addressed]
- AC-3: [Brief description of how addressed]

Related to Epic: [EPIC_ID]
TDD Implementation: Complete RED-GREEN-REFACTOR cycles for all tasks
```

**Complete Non-Code Story Implementation:**

```
[STORY_CODE] chore: complete [project setup/documentation/infrastructure] for [feature area]

Complete setup and configuration including:
- [Task 1]: [Project structure and base configuration setup]
- [Task 2]: [Documentation creation and user guide updates]
- [Task 3]: [CI/CD pipeline and deployment configuration]
- [Task 4]: [Development tooling and quality gate setup]
- Comprehensive project foundation following architectural guidelines

Addresses all acceptance criteria:
- AC-1: [Brief description of setup completion]
- AC-2: [Brief description of documentation coverage]
- AC-3: [Brief description of infrastructure readiness]

Related to Epic: [EPIC_ID]
Setup Complete: Full project foundation ready for feature development
Quality Gates: All configuration validated, documentation verified
```

**Mixed Story (Code + Non-Code) Implementation:**

```
[STORY_CODE] feat: implement [complete story functionality] with full project setup

Complete implementation including:
- [Setup Tasks]: [Project configuration and documentation foundation]
- [Code Tasks]: [Feature implementation with TDD methodology]
- [Infrastructure Tasks]: [CI/CD and deployment configuration]
- Comprehensive test coverage and project documentation
- Integration with [existing architectural components]

Addresses all acceptance criteria:
- AC-1: [Brief description of setup completion]
- AC-2: [Brief description of feature implementation]
- AC-3: [Brief description of infrastructure readiness]

Related to Epic: [EPIC_ID]
Implementation: Complete feature with supporting infrastructure
TDD + Setup: Full RED-GREEN-REFACTOR cycles with project foundation
Quality Gates: All tests passing, configuration validated, documentation complete
```

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- [Product vision, user personas, and requirements](.pair/adoption/product/PRD.md)
- [Development methodology and process definitions](.pair)
- [Task implementation completion status](10-how-to-implement-a-task.md)
- `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` - Project Management Tool Guidelines

**Technical Context:**

- [System architecture patterns and design decisions](.pair/adoption/tech/architecture.md)
- [Technology choices and implementation standards](.pair/adoption/tech/tech-stack.md)
- [Infrastructure and deployment requirements](.pair/adoption/tech/infrastructure.md)
- [User interface patterns and interaction guidelines](.pair/adoption/tech/ux-ui.md)
- [Technical workflow and tool configuration](.pair/adoption/tech/way-of-working.md)

**Domain Context:**

- [Functional boundaries affecting commit scope](.pair/adoption/product/subdomain)
- [Technical boundaries affecting implementation](.pair/adoption/tech/boundedcontext)

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[01-architectural-guidelines.md](.pair/knowledge/guidelines/architecture/architectural-guidelines.md)** - System architecture patterns, bounded contexts, and ADR processes
- **[02-code-design-guidelines.md](.pair/knowledge/guidelines/development/code-design-guidelines.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[03-technical-guidelines.md](.pair/knowledge/guidelines/development/technical-guidelines.md)** - Tech stack, development tools, and feature flag management
- **[04-infrastructure-guidelines.md](.pair/knowledge/guidelines/operations/infrastructure-guidelines.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[05-ux-guidelines.md](.pair/knowledge/guidelines/operations/ux-guidelines.md)** - User experience standards and design principles
- **[06-definition-of-done.md](.pair/knowledge/guidelines/quality/definition-of-done.md)** - Quality criteria and completion standards
- **[07-testing-strategy.md](.pair/knowledge/guidelines/development/testing-strategy.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[08-accessibility-guidelines.md](.pair/knowledge/guidelines/quality/accessibility-guidelines.md)** - Accessibility standards and compliance requirements
- **[09-performance-guidelines.md](.pair/knowledge/guidelines/quality/performance-guidelines.md)** - Performance optimization and monitoring strategies
- **[10-security-guidelines.md](.pair/knowledge/guidelines/quality/security-guidelines.md)** - Security implementation and best practices
- **[11-observability-guidelines.md](.pair/knowledge/guidelines/operations/observability-guidelines.md)** - Monitoring, logging, and tracing strategies

**Process Dependencies:**

- **Prerequisites**: TDD implementation completed following [How to Implement a Task](10-how-to-implement-a-task.md)
- **Input**: Completed task implementation with passing tests and quality validation
- **Output**: Organized commit history with proper traceability ready for pull request creation
- **TDD Integration**: Commit messages document TDD phase completion and methodology compliance
- **Quality Gates**: All technical and process quality standards validated before push
- **Traceability**: Clear links maintained from commits to user stories, tasks, and acceptance criteria
