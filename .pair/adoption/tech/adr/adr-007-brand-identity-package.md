# ADR-007: Brand Identity as Importable Component Library

**Status:** Accepted
**Date:** 2026-02-17
**Context:** Story #120 - Brand Identity

## Decision

Implement the pair brand identity as an importable monorepo package (`@pair/brand`) exposing TypeScript constants, CSS custom properties, React components, and a Tailwind preset. Brand assets are runtime-importable, not static files copied at build time.

### Key Design Choices

1. **Package location**: `packages/brand/` in the monorepo (peer to knowledge-hub, content-ops)
2. **Exports**: Design tokens (TS + CSS), React components (Logo, Card, Button, Callout), Tailwind preset, static SVGs (public/)
3. **Distribution model**: Consumed via standard `import { PairLogo } from '@pair/brand'` — no build step, no asset copying
4. **Peer dependencies**: `react` (^19), `tailwindcss` (^3.4.17) — requires React 19; package doesn't bundle its own React or Tailwind
5. **Zero ad-hoc styling rule**: All components reference `--pair-*` CSS custom properties exclusively

## Rationale

**Alternatives Considered:**

1. **Static assets** (`public/brand/` in website app)
   - ❌ Rejected: Duplicates assets when multiple apps (website, docs, future dashboards) need brand
   - ❌ Rejected: No type safety for color/font constants
   - ❌ Rejected: Cannot enforce zero ad-hoc styling rule

2. **In-app components** (`apps/website/components/brand/`)
   - ❌ Rejected: Couples brand to single app — not reusable
   - ❌ Rejected: Future apps (docs, CLI TUI, dashboards) would duplicate components
   - ❌ Rejected: Violates DRY when multiple consumers exist

3. **External npm package** (published to registry)
   - ❌ Rejected: Adds overhead of versioning, publishing, registry auth
   - ❌ Rejected: Slower iteration when brand and consumers evolve together
   - ❌ Rejected: Out of scope for internal brand identity (not a public design system)

**Selected Approach (Monorepo Package):**

- ✅ Importable by all monorepo apps (website, future docs, future dashboards)
- ✅ Type-safe design tokens (TypeScript constants exported)
- ✅ Single source of truth for brand
- ✅ Zero publishing overhead — consumed via workspace protocol
- ✅ Co-located with consumers — refactor brand and website in parallel

## Consequences

**Positive:**

- Brand components instantly available to all monorepo apps via standard import
- Type safety: `PAIR_BLUE` constant is `'#0062FF'` type, not `string`
- React components enforce brand consistency (rounded corners, elastic transitions, color tokens)
- Tailwind preset injects brand tokens into consumer configs (`presets: [brandPreset]`)
- CSS tokens usable without React (static HTML, MDX docs)
- Backward compatible: existing apps unaffected (brand is new package)

**Negative:**

- New package increases monorepo surface area (8th workspace)
- Peer dependencies: consumers must provide React ^19 and Tailwind ^3.4.17
- Components may be too opinionated for Fumadocs (mitigated: primitives are minimal, Fumadocs has its own system)
- Cannot use brand outside monorepo without publishing (acceptable: brand is internal)

## Implementation

- **Package:** `packages/brand/` — `@pair/brand` v0.4.0
- **Tokens:**
  - `src/tokens/colors.ts` — TypeScript constants (PAIR_BLUE, PAIR_TEAL, neutrals)
  - `src/tokens/typography.ts` — Font stacks (Plus Jakarta Sans, JetBrains Mono)
  - `src/tokens/tokens.css` — CSS custom properties (`:root` light mode + `.dark` dark mode)
- **Components:**
  - `src/components/Logo.tsx` — `<PairLogo variant="favicon|navbar|full" />`
  - `src/components/Card.tsx` — `<Card glass={boolean} />`
  - `src/components/Button.tsx` — `<Button variant="primary|secondary|ghost" />`
  - `src/components/Callout.tsx` — `<Callout type="info|warning|tip" />`
- **Tailwind:** `src/tailwind-preset.ts` — extends theme with brand colors/fonts/transitions
- **Static assets:** `public/*.svg` — logo variants, OG image (for non-React usage)
- **Documentation:** `BRAND.md` — comprehensive brand guide (vision, colors, typography, tone of voice, usage rules)

## Adoption Impact

- `adoption/tech/tech-stack.md` — updated with: React 19.0.0, Tailwind CSS 3.4.17, PostCSS 8.4.49, autoprefixer 10.4.20, Vite 6.0.7, @testing-library/react, @testing-library/jest-dom, jsdom, Plus Jakarta Sans, JetBrains Mono
- `adoption/tech/ux-ui.md` — replaced placeholder with full brand identity section: design tokens, component library, typography, color system, tone of voice

> **Peer dependency note:** pnpm does not support `catalog:` in `peerDependencies`. React is declared as `^19` (any React 19.x); Tailwind is pinned to `^3.4.17` (catalog version). Keep in sync with `pnpm-workspace.yaml` manually when the catalog is updated.

## References

- Story: #120 (Brand Identity)
- Tasks: T-3 (package scaffold), T-4 (tokens), T-5 (Logo), T-6 (UI primitives), T-7 (OG image), T-8 (BRAND.md)
- Dependent stories: S2 #121 (website scaffold), S3 #122 (landing page)
- Brand Guide PDFs: attached to #120
