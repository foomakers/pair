# Pull Request

## PR Information

**PR Title:** [US-433] feat: tokens counter  
**Story/Epic:** #433  
**Type:** Feature  
**Priority:** Medium  
**Assignee:** dev  
**Reviewers:** @reviewer  
**Labels:** feature  

Refs: ENG-412

## Summary

### What Changed

Adds `pair-cli tokens`, a per-area word/token counter.

### Why This Change

Makes prompt-size regressions measurable.

### Story Context

**User Story:** As a maintainer I want a token counter so that shrinkage is measurable.  
**Acceptance Criteria:** AC1-AC6.

## Changes Made

### Implementation Details

- [x] **Change 1:** parser and handler under `commands/tokens`

### Files Changed

- **Modified:** `cli.ts`
- **Added:** `commands/tokens/*`
- **Deleted:** none
- **Renamed:** none

### Database Changes

- [ ] none

### API Changes

- [ ] none

## Testing

### Test Coverage

- [x] **Unit Tests:** handler, parser (95%)
- [x] **Integration Tests:** CLI acceptance
- [ ] **End-to-End Tests:** n/a
- [x] **Manual Testing:** run on this repo

### Test Results

```text
Test Suite: ✅ Passing
Coverage: 95% (target: 80%+)
Linting: ✅ Clean
```

### Testing Strategy

- **Happy Path:** every area counted
- **Edge Cases:** unreadable file skipped
- **Error Handling:** unknown area exits 1
- **Performance:** n/a

## Quality Assurance

### Code Quality Checklist

- [x] Conventions followed; no debug code

### Review Areas

- [ ] **Business Logic:** counting rules

## Deployment Information

### Environment Impact

- [x] **Development:** ready

### Deployment Notes

- **Database Migration:** none

### Rollback Plan

Revert the PR.

## Breaking Changes

### API Breaking Changes

- [ ] none

### Integration Breaking Changes

- [ ] none

### Migration Guide

None needed.

## Documentation

### Documentation Updates

- [x] **README:** CLI reference updated

### Knowledge Sharing

- [x] **Technical Decisions:** ADL recorded

## Performance Impact

### Performance Metrics

- **Load Time:** unchanged

### Benchmarking Results

```text
Before: n/a
After:  n/a
Impact: none
```

### Monitoring

- [ ] none

## Security Considerations

### Security Review

- [x] **Input Validation:** `--area` validated

### Security Testing

- [x] **Security Scan:** clean

## Accessibility

### Accessibility Compliance

- [ ] n/a (CLI text output)

### Accessibility Testing

- [ ] n/a

## Risk Assessment

### Technical Risks

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| Token estimate off | Low | Med | documented as approximation |

### Business Risks

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| none | Low | Low | n/a |

## Reviewer Guide

### Review Focus Areas

1. **Business Logic Validation:** area filters are disjoint

### Testing the Changes

```bash
pnpm --filter @pair/pair-cli test
```

### Key Test Scenarios

1. **Scenario 1:** `pair-cli tokens --area skills`

## Dependencies & Related Work

### Blocking Dependencies

- [ ] none

### Related PRs

- **Follows:** none

### Follow-up Work

- [ ] **Future Enhancements:** shrink templates

## Stakeholder Communication

### Stakeholder Notification

- [ ] **Product Owner:** none needed

### Communication Plan

- **Before Merge:** none

## Pre-Submission Checklist

### Before Creating PR

- [x] All acceptance criteria implemented and tested

### PR Description Complete

- [x] Summary and testing documented

### Ready for Review

- [x] Reviewers assigned; CI passing
