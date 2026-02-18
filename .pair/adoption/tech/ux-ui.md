# UX/UI

- No user interface (UI) is adopted for the initial phase; all interactions are via code and configuration.
- A user interface for RAG management is adopted, built with Next.js and shadcn/ui.
- The application UI follows shadcn/ui patterns for consistency, usability, and modern design.
- User experience is optimized for desktop usage only.
- No accessibility standards are adopted for the initial phase.
- No mobile or browser-specific support is required.
- Content is managed by the team and changes infrequently.

## Brand Identity

- **Brand identity** is adopted via `@pair/brand` component library (packages/brand/).
- **Design tokens** are implemented as CSS custom properties (`--pair-*`) for runtime theming and TypeScript constants for programmatic access.
- **Color palette**:
  - Brand colors: PAIR Blue (#0062FF), PAIR Teal (#00D1FF)
  - Light mode neutrals: white background, dark text
  - Dark mode neutrals: dark background (#0A0D14), light text (#F8FAFC)
  - All brand colors meet WCAG AA contrast requirements
- **Typography**:
  - Sans-serif: Plus Jakarta Sans (headings, UI, body copy)
  - Monospace: JetBrains Mono (code, technical content)
  - Fonts loaded via Google Fonts with system fallbacks
- **Component library**: Logo (3 variants), Card, Button (3 variants), Callout (3 types)
- **Logo**: "Dynamic Dock" design with hover animation (elastic ease, respects prefers-reduced-motion)
- **Component style**: Rounded corners (rounded-2xl), 1px borders, soft shadows, elastic transitions
- **Tone of voice**: Pragmatic, direct, senior partner ("Code is the easy part")
- **Zero ad-hoc styling rule**: All components reference brand tokens exclusively

See `packages/brand/BRAND.md` for comprehensive brand guide and usage rules.

---

All user interface implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
