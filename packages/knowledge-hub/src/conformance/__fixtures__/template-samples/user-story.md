## Story Statement

**As a** maintainer
**I want** a token counter per area
**So that** prompt shrinkage is measurable

**Where**: pair-cli

## Epic Context

**Parent Epic**: Shrink discipline (#400)
**Status**: Refined
**Priority**: P1 (Should-Have) (confirmed during refinement)

### Status Workflow

- **Refined**: ready for development

## Classification

`risk:green` · `cost:green` · coupling: not assessed — no domain artifacts

<details>
<summary>Matrix — per dimension</summary>

| Dimension | Tier | Source | Note |
| --------- | ---- | ------ | ---- |
| Coupling balance | not assessed | absent | |

</details>

## Acceptance Criteria

### Functional Requirements

1. **Given** a project with templates
   **When** I run `pair-cli tokens`
   **Then** I see words and tokens per area

2. **Given** an unknown `--area`
   **When** I run the command
   **Then** it exits 1 and lists the valid areas

### Business Rules

- tokens = ceil(characters / 4)

### Edge Cases and Error Handling

- **Invalid Input**: unknown area exits 1

## Definition of Done Checklist

### Development Completion

- [x] All acceptance criteria implemented and verified

### Quality Assurance

- [x] Edge cases tested

### Deployment and Release

- [x] Deployed to staging

## Story Sizing and Sprint Readiness

### Refined Story Points

**Final Story Points**: 3
**Confidence Level**: High
**Sizing Justification**: one command, no migrations

### Sprint Capacity Validation

**Sprint Fit Assessment**: fits
**Development Time Estimate**: 2 days
**Testing Time Estimate**: 1 day
**Total Effort Assessment**: Fits within sprint capacity: Yes

### Story Splitting Recommendations

Not needed.

## Dependencies and Coordination

### Story Dependencies

**Prerequisite Stories**: none

### Team Coordination

**Development Roles Involved**:

- **Backend**: CLI

### External Dependencies

**Third-party Integrations**: none

## Validation and Testing Strategy

### Acceptance Testing Approach

**Testing Methods**: acceptance tests

### User Validation

**Success Metrics**: delta reported on pair's corpus

## Notes and Additional Context

**Refinement Session Insights**: no tokenizer, approximation only

## Technical Analysis

### Implementation Approach

**Technical Strategy**: walk areas, count
**Design**: not required

### Technical Requirements

- Read-only, no network

### Technical Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| Estimate drift | Low | Medium | documented |

### Spike Requirements

**Required Spikes**: none
