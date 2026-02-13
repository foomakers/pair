# VS Code Copilot Prompt Files

This directory contains ultra-simple prompt files for VS Code Copilot that provide shortcuts for common development tasks.

## ⚡ Ultra-Simple Prompts

Each prompt is designed to be **dead simple**:

- **Just type the command** - no parameters needed
- **Reads the how-to guide** and follows it exactly
- **Asks questions** only when absolutely necessary
- **Zero configuration** - works out of the box

## Available Prompts

### Induction (Getting Started)

- **`/create-prd`** - Create a Product Requirements Document (PRD)
- **`/pair-process-bootstrap`** - Complete project bootstrap checklist
- **`/subdomains`** - Define business subdomains

### Strategic (High-level Planning)

- **`/prioritize-initiatives`** - Create and prioritize strategic initiatives
- **`/bounded-contexts`** - Define bounded contexts
- **`/breakdown-epics`** - Breakdown epics from initiatives

### Iteration (Sprint Planning)

- **`/breakdown-stories`** - Breakdown user stories from epics
- **`/pair-process-refine-story`** - Refine user story with acceptance criteria

### Execution (Development)

- **`/create-tasks`** - Create development tasks from user stories
- **`/implement-task`** - Implement a specific development task

### Review (Quality Assurance)

- **`/code-review`** - Perform comprehensive code review

## How to Use

1. **Enable prompt files** in VS Code settings: `chat.promptFiles: true`
2. **Type `/` in chat** followed by the prompt name (e.g., `/create-prd`)
3. **That's it!** The prompt handles everything else

## Examples

**Super simple - just type the command:**

```
/create-prd
/implement-task
/code-review
/create-tasks
/breakdown-stories
/pair-process-refine-story
```

**With optional IDs for context:**

```
/breakdown-epics: initiative_id=INIT-123
/breakdown-stories: epic_id=EPIC-456
/create-tasks: story_id=STORY-789
/implement-task: story_id=STORY-789
/implement-task: task_id=TASK-101
/pair-process-refine-story: story_id=STORY-789
/code-review: pr_id=123
/code-review: story_id=STORY-789
```

## Session State Tracking

Each prompt maintains session state to ensure consistency throughout the process according to its how-to guide.

## 🚀 Key Benefits

- **Zero Setup**: Just type `/prompt-name`
- **Zero Parameters**: No need to remember anything
- **Zero Configuration**: Works immediately
- **100% Process Compliant**: Follows how-to guides exactly
- **Smart Questions**: Only asks when absolutely necessary

## 🔧 How It Works

Each prompt:

1. **Reads the how-to guide** to understand the complete process
2. **Follows it exactly** - all phases, checkpoints, deliverables
3. **Asks questions** only when it needs specific information from you
4. **Handles everything else** automatically

**That's it!** Maximum simplicity, maximum compliance with your established processes.

---

For detailed implementation guidance, refer to the individual how-to files linked in each prompt's reference section.
