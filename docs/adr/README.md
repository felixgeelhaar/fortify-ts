# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Fortify-TS project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs help:

- Document the reasoning behind significant decisions
- Provide context for new team members
- Track the evolution of the architecture
- Enable informed future decisions

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](001-monorepo-structure.md) | Monorepo Structure with pnpm Workspaces | Accepted | 2024-01 |
| [ADR-002](002-operation-type-design.md) | Operation Type with AbortSignal | Accepted | 2024-01 |
| [ADR-003](003-error-hierarchy.md) | Error Hierarchy Design | Accepted | 2024-01 |
| [ADR-004](004-middleware-chain-pattern.md) | Middleware Chain Pattern | Accepted | 2024-01 |
| [ADR-005](005-browser-compatibility.md) | Browser Compatibility Strategy | Accepted | 2024-01 |
| [ADR-006](006-configuration-validation.md) | Configuration Validation with Zod | Accepted | 2024-01 |

## ADR Template

When creating a new ADR, use the following template:

```markdown
# ADR-XXX: Title

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

[Describe the issue or decision that needs to be made]

## Decision

[Describe the decision that was made]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Drawback 1]
- [Drawback 2]

### Neutral
- [Observation 1]

## Alternatives Considered

[List alternatives that were considered and why they were rejected]
```

## Creating a New ADR

1. Copy the template above
2. Create a new file: `docs/adr/XXX-title-slug.md`
3. Fill in all sections
4. Update this README's index table
5. Submit for review
