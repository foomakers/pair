# @pair/ts-config

Shared TypeScript configuration presets for the pair monorepo.

## Presets

| Preset | File | Use Case |
|--------|------|----------|
| Base | `base.json` | Common compiler options (strict mode, ESM, path resolution) |
| Node | `node.json` | CLI and server packages (extends base + Node types) |
| UI | `ui.json` | React/Next.js packages (extends base + JSX + DOM types) |

## Usage

Extend a preset in your package's `tsconfig.json`:

```json
{
  "extends": "@pair/ts-config/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```
