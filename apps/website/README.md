# @pair/website

Documentation and landing page site built with [Fumadocs](https://fumadocs.vercel.app/) + Next.js 15. Deployed on Vercel (free tier).

## Content Structure

Content follows the [Diataxis](https://diataxis.fr/) model under `content/docs/`:

```text
content/docs/
├── getting-started/    # Tutorials — learning-oriented
├── guides/             # How-to guides — task-oriented
├── concepts/           # Explanation — understanding-oriented
├── reference/          # Reference — information-oriented
├── customization/      # Customization and extensibility
├── integrations/       # AI tool and PM tool integrations
├── pm-tools/           # Project management tool guides
├── developer-journey/  # Progressive adoption paths
├── support/            # FAQ, troubleshooting, resources
└── meta.json           # Fumadocs navigation config
```

Pages are `.mdx` files processed by `fumadocs-mdx`. Navigation is configured in `source.config.ts`.

## Development

```bash
pnpm --filter @pair/website dev          # dev server (port 3000)
pnpm --filter @pair/website build        # production build
pnpm --filter @pair/website test         # vitest + playwright CT
pnpm --filter @pair/website e2e          # playwright E2E (builds first)
pnpm --filter @pair/website a11y:report  # accessibility audit
pnpm --filter @pair/website lint         # eslint
```

### Key Files

| File | Purpose |
|------|---------|
| `source.config.ts` | Fumadocs content source configuration |
| `next.config.mjs` | Next.js configuration |
| `tailwind.config.ts` | Tailwind CSS + `@pair/brand` preset |
| `app/layout.tsx` | Root layout (fonts, PostHog, theme) |
| `app/docs/layout.tsx` | Docs layout (sidebar, TOC) |
| `lib/source.ts` | Content source loader |

### Search

Client-side search via [Orama](https://orama.com/) — built into Fumadocs, zero external dependencies.

### Environment Variables

```bash
# .env.example
NEXT_PUBLIC_POSTHOG_KEY=       # PostHog analytics (optional)
NEXT_PUBLIC_POSTHOG_HOST=      # PostHog host (optional)
```

### Dependencies

- [`@pair/brand`](../../packages/brand/BRAND.md) — design tokens, components, Tailwind preset
- [`fumadocs-core`](https://fumadocs.vercel.app/) / `fumadocs-mdx` / `fumadocs-ui` — docs framework
- [`posthog-js`](https://posthog.com/) — analytics (opt-in)
