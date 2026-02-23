# pair Brand Identity Guide

## Brand Vision

pair is an AI-assisted development tool built for pragmatic developers who value alignment between human intent and machine execution. Our brand embodies three core principles:

- **Alignment**: Human and AI working in seamless partnership
- **Precision**: Code that reflects intent accurately
- **Flow**: Smooth, uninterrupted development experience

**Brand Claim**: "Code is the easy part."

This claim reflects our philosophy that the real challenge in software development isn't writing code—it's understanding requirements, making decisions, and maintaining alignment across the team. pair handles the mechanical work so developers can focus on what matters.

## Visual Identity

### The Dynamic Dock Logo

The pair logo represents the partnership between human developer (blue) and AI assistant (teal) as two rounded pills docked side by side—a visual metaphor for paired programming.

**Logo Variants**:

- **Favicon** (32x32): Icon-only, two pills vertical stack
- **Navbar** (24px height): Horizontal mark + wordmark
- **Full** (40x52): Vertical mark + wordmark, hero contexts

**Logo Mark Geometry**:

- Two rounded rectangles (pills): 60px width × 150px height, 30px border radius
- Blue pill (Human): left position, `#0062FF`
- Teal pill (AI): right position, offset 100px, `#00D1FF`
- Pills appear to "dock" together with minimal gap

**Wordmark**:

- Always lowercase: `pair` (never "Pair", "PAIR", or "pAIr")
- Typography: Plus Jakarta Sans Bold
- Color: inherits from context (dark text on light bg, light text on dark bg)

### Logo Animation

**Hover Interaction**: In the default (rest) state the two pills are vertically offset, creating a deliberately "misaligned" look. On hover they snap back to perfect alignment with an elastic ease:

- Default state — Blue pill: `translateY(-4px)`, Teal pill: `translateY(4px)`
- Hover state — Both pills: `translateY(0)` (aligned)
- Transition: `0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` (elastic ease)
- Respects `prefers-reduced-motion`: animation disabled, pills render in aligned position

**Usage**:

```tsx
import { PairLogo } from '@pair/brand'

// Navbar
<PairLogo variant="navbar" size={24} />

// Hero section
<PairLogo variant="full" animate={true} />

// Favicon (no animation)
<PairLogo variant="favicon" animate={false} />
```

### Logo Usage Rules

**DO**:

- Use the logo at minimum size: 32x32 for favicon, 24px height for navbar
- Maintain adequate clear space around the logo (minimum 16px)
- Use official color values from design tokens
- Ensure wordmark is always lowercase

**DON'T**:

- Distort, rotate, or skew the logo
- Change the pill colors to non-brand values
- Separate the pills or rearrange their position
- Add effects (drop shadows, outlines, gradients) to the mark
- Use the logo on backgrounds with insufficient contrast

## Color Palette

### Brand Colors

| Color | Hex | CSS Variable | Role | Usage |
|-------|-----|--------------|------|-------|
| **PAIR Blue** | `#0062FF` | `--pair-blue` | Human side, primary actions | Buttons, links, blue pill |
| **PAIR Teal** | `#00D1FF` | `--pair-teal` | AI side, secondary actions | Accents, teal pill, success states |

### Light Mode Neutrals

| Color | Hex | CSS Variable | Role | Usage |
|-------|-----|--------------|------|-------|
| **Background** | `#FFFFFF` | `--pair-bg` | Page background | Body, cards (non-glass) |
| **Text Main** | `#0A0D14` | `--pair-text-main` | Primary text | Headings, body copy |
| **Text Muted** | `#4B5563` | `--pair-text-muted` | Secondary text | Captions, metadata |
| **Border** | `#F1F5F9` | `--pair-border` | Dividers, outlines | Card borders, separators |

### Dark Mode Neutrals

| Color | Hex | CSS Variable | Role | Usage |
|-------|-----|--------------|------|-------|
| **Background** | `#0A0D14` | `--pair-bg` | Page background | Body, cards (non-glass) |
| **Text Main** | `#F8FAFC` | `--pair-text-main` | Primary text | Headings, body copy |
| **Text Muted** | `#94A3B8` | `--pair-text-muted` | Secondary text | Captions, metadata |
| **Border** | `#1E293B` | `--pair-border` | Dividers, outlines | Card borders, separators |

### Semantic Colors

| Purpose | Light | Dark | CSS Variable | Usage |
|---------|-------|------|--------------|-------|
| **Info** | `#0062FF` (blue-50 bg) | `#0062FF` (blue-950 bg) | `--pair-blue` | Info callouts, help text |
| **Warning** | `#F59E0B` (amber-50 bg) | `#F59E0B` (amber-950 bg) | N/A | Warning callouts, alerts |
| **Success** | `#00D1FF` (teal-50 bg) | `#00D1FF` (teal-950 bg) | `--pair-teal` | Success states, tips |

### Accessibility

All color combinations meet **WCAG AA** contrast ratio requirements (4.5:1 for normal text, 3:1 for large text).

**Zero ad-hoc color values**: All components reference `--pair-*` CSS custom properties exclusively.

## Typography

### Font Stacks

**Sans-serif** (UI, headings, body copy):

```css
font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
```

- Primary brand typeface
- Variable font weights: 400 (Regular), 600 (Semibold), 700 (Bold)
- **Font loading is the consumer's responsibility.** The `@pair/brand` package defines CSS custom properties (`--font-sans`, `--font-mono`) but does not load the fonts. Consumers must load the fonts via Google Fonts or self-hosted files. Recommended snippet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- If fonts fail to load, `system-ui` and `monospace` fallbacks maintain readability

**Monospace** (code, technical content):

```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

- Code blocks, terminal output, file paths
- Weights: 400 (Regular), 500 (Medium)

### Type Scale

| Element | Size | Weight | Line Height | CSS Class |
|---------|------|--------|-------------|-----------|
| **H1 Hero** | 3.5rem (56px) | 700 | 1.1 | `text-5xl font-bold` |
| **H1** | 2.5rem (40px) | 700 | 1.2 | `text-4xl font-bold` |
| **H2** | 2rem (32px) | 700 | 1.3 | `text-3xl font-bold` |
| **H3** | 1.5rem (24px) | 600 | 1.4 | `text-2xl font-semibold` |
| **H4** | 1.25rem (20px) | 600 | 1.4 | `text-xl font-semibold` |
| **Body Large** | 1.125rem (18px) | 400 | 1.6 | `text-lg` |
| **Body** | 1rem (16px) | 400 | 1.6 | `text-base` |
| **Caption** | 0.875rem (14px) | 400 | 1.5 | `text-sm` |
| **Code** | 0.875rem (14px) | 400 (mono) | 1.6 | `font-mono text-sm` |

## Tone of Voice

pair's communication style is **pragmatic, direct, and balanced**—like a senior engineering partner who respects your expertise.

**Senior Partner Tone**:

- **Direct**: No fluff, no marketing speak. Say what it does.
- **Pragmatic**: Focus on outcomes, not buzzwords. "Code is the easy part" not "Revolutionary AI-powered paradigm shift."
- **Balanced**: Acknowledge trade-offs. "This works well for X, less so for Y."
- **Respectful**: Assume competence. Never condescending or overly explanatory.
- **Conversational**: Human, not robotic. "Let's fix this" not "Initiating corrective procedure."

**Voice Examples**:

❌ "Leverage our cutting-edge AI to supercharge your development workflow!"
✅ "pair handles the mechanical work. You focus on decisions."

❌ "Seamlessly integrate with your existing tech stack using our revolutionary API."
✅ "Works with your current setup. TypeScript, Node.js, standard tools."

❌ "Experience the future of software development today!"
✅ "Write less boilerplate. Ship faster. Code is the easy part."

## Component Style Guidelines

All UI components follow these principles:

### Corners

- **Cards, containers**: `rounded-2xl` (16px border radius)
- **Buttons, inputs**: `rounded-lg` (8px border radius)
- **Pills, badges**: `rounded-full`

### Borders

- **Thickness**: 1px solid
- **Color**: `border-slate-200` (light) / `border-slate-800` (dark)
- **Accent borders**: 4px left border for callouts (`border-l-4`)

### Shadows

- **Soft glow**: `shadow-sm` (subtle elevation for cards)
- **No heavy shadows**: Avoid `shadow-xl`, `shadow-2xl` for clean, modern feel

### Transitions

- **Duration**: 200ms (standard), 600ms (logo animation)
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (elastic) for playful interactions
- **Properties**: `transition-all` for multi-property changes, specific props when performant

### Glass Effect

For hero sections and overlays:

```css
.glass-effect {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

## Design Tokens Reference

### CSS Custom Properties

Import `@pair/brand/tokens.css` to access all tokens:

```css
@import '@pair/brand/tokens.css';
```

**Colors**:

```css
--pair-blue: #0062FF
--pair-teal: #00D1FF

/* Light mode (default :root) */
--pair-bg: #FFFFFF
--pair-text-main: #0A0D14
--pair-text-muted: #4B5563
--pair-border: #F1F5F9

/* Dark mode (.dark) */
--pair-bg: #0A0D14
--pair-text-main: #F8FAFC
--pair-text-muted: #94A3B8
--pair-border: #1E293B
```

**Typography**:

```css
--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif
--font-mono: 'JetBrains Mono', monospace
```

**Transitions**:

```css
--ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Tailwind Preset

Import the Tailwind preset in your `tailwind.config.ts`:

```typescript
import brandPreset from '@pair/brand/tailwind-preset'

export default {
  presets: [brandPreset],
  content: ['./src/**/*.{ts,tsx}'],
}
```

Adds:

- `bg-pair-blue`, `text-pair-blue`, `border-pair-blue`
- `bg-pair-teal`, `text-pair-teal`, `border-pair-teal`
- `font-sans`, `font-mono` (Plus Jakarta Sans, JetBrains Mono)
- `transition-elastic` (0.6s elastic easing)

### Utility Classes

**Gradient Background**:

```css
.gradient-brand {
  background: linear-gradient(135deg, #0062FF 0%, #00D1FF 100%);
}
```

**Text Gradient**:

```css
.text-gradient {
  background: linear-gradient(135deg, #0062FF 0%, #00D1FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

## Component Library

### PairLogo

Logo component with 3 variants and optional hover animation.

```tsx
import { PairLogo } from '@pair/brand'

<PairLogo variant="navbar" size={24} animate={true} />
```

**Props**:

- `variant`: `'favicon' | 'navbar' | 'full'` (default: `'navbar'`)
- `size`: number (override default size)
- `animate`: boolean (default: `true`)
- `className`: string (additional Tailwind classes)

### Card

Container component with rounded corners, border, shadow, and optional glass effect.

```tsx
import { Card } from '@pair/brand'

<Card glass={false}>
  <h3>Card Title</h3>
  <p>Card content</p>
</Card>
```

**Props**:

- `children`: ReactNode
- `className`: string
- `glass`: boolean (default: `false`)

### Button

Button component with 3 variants (primary, secondary, ghost).

```tsx
import { Button } from '@pair/brand'

<Button variant="primary" onClick={handleClick}>
  Click Me
</Button>
```

**Props**:

- `variant`: `'primary' | 'secondary' | 'ghost'` (default: `'primary'`)
- `children`: ReactNode
- `className`: string
- Standard `<button>` HTML attributes (onClick, disabled, etc.)

**Variants**:

- **primary**: Blue background (`bg-pair-blue`), white text
- **secondary**: Teal background (`bg-pair-teal`), white text
- **ghost**: Transparent background, border, hover state

### Callout

Documentation callout component with 3 types (info, warning, tip).

```tsx
import { Callout } from '@pair/brand'

<Callout type="info" title="Note">
  This is an informational callout.
</Callout>
```

**Props**:

- `type`: `'info' | 'warning' | 'tip'` (default: `'info'`)
- `title`: string (optional)
- `children`: ReactNode
- `className`: string

**Types**:

- **info**: Blue accent, blue-50/blue-950 background
- **warning**: Amber accent, amber-50/amber-950 background
- **tip**: Teal accent, teal-50/teal-950 background

## Usage Examples

### Import Design Tokens

```typescript
import { PAIR_BLUE, PAIR_TEAL, FONT_SANS } from '@pair/brand'

const myConfig = {
  brandColor: PAIR_BLUE, // '#0062FF'
  fontFamily: FONT_SANS,  // "'Plus Jakarta Sans', system-ui, sans-serif"
}
```

### Import CSS Tokens

```tsx
import '@pair/brand/tokens.css'

function App() {
  return (
    <div style={{ backgroundColor: 'var(--pair-bg)', color: 'var(--pair-text-main)' }}>
      <h1 className="text-gradient">pair</h1>
    </div>
  )
}
```

### Use Components

```tsx
import { PairLogo, Card, Button, Callout } from '@pair/brand'

function LandingPage() {
  return (
    <>
      <header>
        <PairLogo variant="navbar" />
      </header>

      <Card>
        <h2>Welcome to pair</h2>
        <p>Code is the easy part.</p>
        <Button variant="primary">Get Started</Button>
      </Card>

      <Callout type="tip" title="Pro Tip">
        Import design tokens to maintain brand consistency across all components.
      </Callout>
    </>
  )
}
```

## For Developers

### Package Exports

| Export | Import | Content |
|--------|--------|---------|
| Main | `@pair/brand` | React components (`PairLogo`, `Card`, `Button`, `Callout`) + design token constants |
| CSS Tokens | `@pair/brand/tokens.css` | CSS custom properties (`--pair-blue`, `--pair-bg`, etc.) |
| Tailwind Preset | `@pair/brand/tailwind-preset` | Tailwind theme extension (colors, fonts, transitions) |

### Setup in a Consumer Package

1. Add dependency: `"@pair/brand": "workspace:*"` in `package.json`
2. Import CSS tokens in your root layout:

   ```tsx
   import '@pair/brand/tokens.css'
   ```

3. Add Tailwind preset in `tailwind.config.ts`:

   ```typescript
   import brandPreset from '@pair/brand/tailwind-preset'
   export default { presets: [brandPreset], content: ['./src/**/*.{ts,tsx}'] }
   ```

4. Load fonts (consumer responsibility — not bundled):

   ```html
   <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
   ```

### Development

```bash
pnpm --filter @pair/brand dev          # vite dev server (port 5173)
pnpm --filter @pair/brand test         # vitest + playwright CT
pnpm --filter @pair/brand a11y:report  # accessibility audit
pnpm --filter @pair/brand lint         # eslint
```

### Package Structure

```text
src/
├── index.ts              # Main exports (components + tokens)
├── tokens/
│   └── tokens.css        # CSS custom properties (light/dark)
├── tailwind-preset.ts    # Tailwind theme preset
└── components/           # React components
    ├── PairLogo.tsx
    ├── Card.tsx
    ├── Button.tsx
    └── Callout.tsx
```

Peer dependencies: `react ^19`, `next-themes ^0.4`, `tailwindcss ^3.4`.

---

**Package**: `@pair/brand` v0.4.0
**Last Updated**: 2026-02-23
**Maintained By**: foomakers
