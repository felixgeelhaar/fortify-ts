# ADR-001: Monorepo Structure with pnpm Workspaces

## Status

Accepted

## Context

Fortify-TS is a resilience library with multiple patterns (circuit breaker, retry, timeout, rate limiting, bulkhead, fallback) that need to be independently versionable and publishable while sharing common code and build infrastructure.

We needed to decide on the project structure:
1. Single package with all patterns bundled
2. Separate repositories for each pattern
3. Monorepo with multiple packages

## Decision

We chose a **monorepo structure using pnpm workspaces** with **Turborepo** for build orchestration.

### Package Structure

```
packages/
├── core/           # Shared types, errors, utilities
├── circuit-breaker/
├── retry/
├── timeout/
├── rate-limit/
├── bulkhead/
├── fallback/
├── middleware/     # Chain composition
├── http/           # HTTP client integration
├── logging/        # Logging utilities
├── metrics/        # Metrics collection
├── tracing/        # Distributed tracing
└── testing/        # Test utilities
```

### Build Tools

- **pnpm**: Package manager with workspace support, strict dependency management, and efficient disk usage
- **Turborepo**: Build orchestration with caching, parallel execution, and dependency-aware task ordering
- **tsup**: Fast TypeScript bundler outputting ESM + CJS with declarations

## Consequences

### Positive

- **Independent publishing**: Each package can be versioned and published independently
- **Tree-shaking**: Users only import what they need, reducing bundle size
- **Shared infrastructure**: Single CI/CD pipeline, consistent tooling across packages
- **Atomic changes**: Cross-package changes are atomic in a single PR
- **Efficient builds**: Turborepo caches and parallelizes builds, only rebuilding changed packages
- **Strict dependencies**: pnpm prevents phantom dependencies and ensures correct peer dependencies

### Negative

- **Initial complexity**: More configuration files and setup compared to single package
- **Dependency coordination**: Version bumps may require coordinated releases
- **Learning curve**: Contributors need to understand monorepo workflows

### Neutral

- Package interdependencies create a clear hierarchy (core → patterns → middleware → http)
- Each package has its own `package.json`, `tsconfig.json`, and `tsup.config.ts`

## Alternatives Considered

### Single Package

**Rejected because:**
- Forces users to install everything even if they only need one pattern
- Larger bundle sizes for applications
- Cannot version patterns independently

### Separate Repositories

**Rejected because:**
- Difficult to make atomic cross-repository changes
- Duplicated CI/CD and tooling configuration
- Harder to maintain version compatibility between packages
- More overhead for contributors

### npm Workspaces or Yarn

**Rejected in favor of pnpm because:**
- pnpm has stricter dependency resolution preventing phantom dependencies
- More efficient disk usage with content-addressable storage
- Better monorepo support out of the box
