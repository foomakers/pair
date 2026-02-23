# @pair/brand

Brand identity package: design tokens, React components, and Tailwind preset. See [BRAND.md](BRAND.md) for the full brand identity guide (visual identity, colors, typography, tone of voice, component specs).

## Exports

| Export | Import | Content |
|--------|--------|---------|
| Main | `@pair/brand` | React components (`PairLogo`, `Card`, `Button`, `Callout`) + token constants |
| CSS Tokens | `@pair/brand/tokens.css` | CSS custom properties (`--pair-blue`, `--pair-bg`, etc.) |
| Tailwind Preset | `@pair/brand/tailwind-preset` | Theme extension (colors, fonts, transitions) |

Peer dependencies: `react ^19`, `next-themes ^0.4`, `tailwindcss ^3.4`.

## Development

```bash
pnpm --filter @pair/brand dev          # vite dev server (port 5173)
pnpm --filter @pair/brand test         # vitest + playwright CT
pnpm --filter @pair/brand a11y:report  # accessibility audit
pnpm --filter @pair/brand lint         # eslint
```

## Structure

```text
src/
├── index.ts              # Main exports (components + tokens)
├── tokens/tokens.css     # CSS custom properties (light/dark)
├── tailwind-preset.ts    # Tailwind theme preset
└── components/           # PairLogo, Card, Button, Callout
```
